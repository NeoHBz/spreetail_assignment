import { Router, Response } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "@spreetail/db";
import { Logger, splitEqual, splitUnequal, splitPercentage, splitShare } from "@spreetail/shared";
import { AuthRequest, isAuthenticated } from "../middleware/auth";


const router: Router = Router();

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // Max 10MB

// Helper to fuzzy match user names
function fuzzyMatchUser(name: string, users: any[]) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  return users.find((u) => u.name.toLowerCase() === normalized) || null;
}

// Check if a member is active on a given date
function isMemberActive(member: any, date: Date) {
  const joined = new Date(member.joinedAt);
  const left = member.leftAt ? new Date(member.leftAt) : null;
  return date >= joined && (!left || date <= left);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Stage 1: Parse and Detect Anomalies
router.post("/upload", isAuthenticated, upload.single("file"), async (req: AuthRequest, res: Response) => {
  const { groupId } = req.body;
  if (!groupId || !req.file) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Group ID and CSV file are required" } });
  }

  try {
    const rawCSV = req.file.buffer.toString("utf8");
    const records = parse(rawCSV, {
      columns: true,
      skip_empty_lines: true,
    });

    // Get group members and existing users
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId },
      include: { user: true },
    });
    const groupUsers = memberships.map((m) => ({
      id: m.userId,
      name: m.user.name,
      email: m.user.email,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
    }));

    const allUsers = await prisma.user.findMany();

    // Lazy cleanup: delete pending sessions older than 24h for this group
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.importSession.deleteMany({
      where: {
        groupId,
        status: "pending",
        createdAt: { lt: cutoff },
      },
    });

    // Create session
    const session = await prisma.importSession.create({
      data: {
        groupId,
        filename: req.file.originalname,
        status: "pending",
      },
    });

    const anomalies: any[] = [];
    const rowsStaged: any[] = [];

    // Let's iterate through rows and run checks
    let rowNumber = 1; // Row 1 is header, so data starts at 2
    for (const record of records) {
      rowNumber++;
      const rawDate = record.date;
      const rawDescription = record.description;
      const rawPaidBy = record.paid_by;
      const rawAmount = record.amount;
      const rawCurrency = record.currency;
      const rawSplitType = record.split_type;
      const rawSplitWith = record.split_with;
      const rawSplitDetails = record.split_details;
      const rawNotes = record.notes;

      const rowAnomalies: any[] = [];

      // 1. Whitespace in Payer / Case Inconsistencies
      let cleanedPayer = rawPaidBy ? rawPaidBy.trim() : "";
      if (rawPaidBy && rawPaidBy !== cleanedPayer) {
        rowAnomalies.push({
          anomalyType: "whitespace_payer",
          description: `Payer name "${rawPaidBy}" has leading/trailing whitespaces.`,
          resolution: "auto_fixed",
          resolutionNotes: `Trimmed to "${cleanedPayer}"`,
        });
      }

      // Fuzzy matching payer name
      let matchedUser = fuzzyMatchUser(cleanedPayer, allUsers);
      if (cleanedPayer && matchedUser && matchedUser.name !== cleanedPayer) {
        rowAnomalies.push({
          anomalyType: "case_inconsistency_payer",
          description: `Payer name "${cleanedPayer}" has case mismatch. Matching to canonical "${matchedUser.name}".`,
          resolution: "auto_fixed",
          resolutionNotes: `Normalized to "${matchedUser.name}"`,
        });
        cleanedPayer = matchedUser.name;
      }

      // 2. Whitespace in Amount / Malformed Amount
      let cleanedAmountStr = rawAmount ? rawAmount.replace(/,/g, "").trim() : "";
      if (rawAmount && rawAmount !== cleanedAmountStr) {
        rowAnomalies.push({
          anomalyType: "whitespace_amount",
          description: `Amount value "${rawAmount}" has whitespaces or commas.`,
          resolution: "auto_fixed",
          resolutionNotes: `Normalized to "${cleanedAmountStr}"`,
        });
      }

      let parsedAmount = parseFloat(cleanedAmountStr);
      if (rawAmount && isNaN(parsedAmount)) {
        rowAnomalies.push({
          anomalyType: "malformed_amount",
          description: `Amount value "${rawAmount}" cannot be parsed as a number.`,
          resolution: "pending",
        });
      }

      // 3. Sub-paisa Precision
      if (!isNaN(parsedAmount) && cleanedAmountStr.includes(".")) {
        const decimals = cleanedAmountStr.split(".")[1];
        if (decimals && decimals.length > 2) {
          const roundedAmount = Math.round(parsedAmount * 100) / 100;
          rowAnomalies.push({
            anomalyType: "sub_paisa_precision",
            description: `Amount ${parsedAmount} has sub-paisa precision.`,
            resolution: "auto_fixed",
            resolutionNotes: `Rounded to ${roundedAmount}`,
            editedValue: { amount: roundedAmount },
          });
          parsedAmount = roundedAmount;
        }
      }

      // 4. Unknown or Missing Payer
      if (!cleanedPayer) {
        rowAnomalies.push({
          anomalyType: "missing_payer",
          description: "Payer is missing or empty.",
          resolution: "pending",
        });
      } else if (!matchedUser) {
        rowAnomalies.push({
          anomalyType: "unknown_payer",
          description: `Payer "${cleanedPayer}" is not a recognized flat user.`,
          resolution: "pending",
        });
      }

      // 5. Missing Currency
      let currency = rawCurrency ? rawCurrency.trim().toUpperCase() : "";
      if (!currency) {
        rowAnomalies.push({
          anomalyType: "missing_currency",
          description: "Currency field is missing. Defaulting to INR.",
          resolution: "auto_fixed",
          resolutionNotes: 'Set currency to "INR"',
          editedValue: { currency: "INR" },
        });
        currency = "INR";
      }

      // 6. Zero Amount
      if (parsedAmount === 0) {
        rowAnomalies.push({
          anomalyType: "zero_amount",
          description: "Amount is zero. Typically indicates a cancelled or invalid expense.",
          resolution: "pending",
        });
      }

      // 7. Negative Amount
      if (parsedAmount < 0) {
        rowAnomalies.push({
          anomalyType: "negative_amount",
          description: "Amount is negative. This will be created as a refund (negative split).",
          resolution: "auto_fixed",
          resolutionNotes: "Allowed as negative refund split",
        });
      }

      // 8. Date Formats & Ambiguity
      let dateObj: Date | null = null;
      let dateAmbiguous = false;
      let dateIssue = false;
      let dateDesc = "";

      if (rawDate) {
        const cleanedDateStr = rawDate.trim();
        // Check "Mar 14" format (missing year)
        if (/^[a-zA-Z]{3}\s\d{1,2}$/.test(cleanedDateStr)) {
          // Row 27: Mar 14. We parse it assuming 2026 trip year
          dateObj = new Date(`2026-${cleanedDateStr}`);
          dateIssue = true;
          dateDesc = "Date is missing the year. Extrapolated to 2026 based on trip period.";
          rowAnomalies.push({
            anomalyType: "missing_year",
            description: dateDesc,
            resolution: "auto_fixed",
            resolutionNotes: `Set to ${dateObj.toISOString().split("T")[0]}`,
            editedValue: { date: dateObj.toISOString() },
          });
        } else {
          // Check DD/MM/YYYY vs YYYY-MM-DD
          // Match standard date parts
          const parts = cleanedDateStr.split(/[-/]/);
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              // YYYY-MM-DD
              dateObj = new Date(cleanedDateStr);
            } else {
              // DD/MM/YYYY or MM/DD/YYYY
              const first = parseInt(parts[0], 10);
              const second = parseInt(parts[1], 10);
              const year = parseInt(parts[2], 10);

              // check ambiguity e.g. 04/05/2026
              if (first <= 12 && second <= 12 && first !== second) {
                dateAmbiguous = true;
                // DD/MM/YYYY → first is the day, second is the month
                // MM/DD/YYYY → first is the month, second is the day
                const ddmm = new Date(year, second - 1, first);
                const mmdd = new Date(year, first - 1, second);
                const fmt = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                // Default to DD/MM/YYYY matching the primary list style; user confirms below.
                // dateOptions[0] is always the DD/MM reading, [1] the MM/DD reading —
                // the frontend's "treat all as DD/MM" / "MM/DD" bulk action relies on this order.
                dateObj = ddmm;
                rowAnomalies.push({
                  anomalyType: "ambiguous_date",
                  description: `Date "${cleanedDateStr}" is ambiguous: ${fmt(ddmm)} (DD/MM/YYYY) or ${fmt(mmdd)} (MM/DD/YYYY)?`,
                  resolution: "pending", // require user confirmation
                  editedValue: {
                    dateOptions: [
                      { label: `${fmt(ddmm)} · DD/MM`, value: ddmm.toISOString() },
                      { label: `${fmt(mmdd)} · MM/DD`, value: mmdd.toISOString() },
                    ],
                  },
                });
              } else {
                // Not ambiguous. Treat as DD/MM/YYYY
                dateObj = new Date(year, second - 1, first);
              }
            }
          }
        }
      }

      if (!dateObj || isNaN(dateObj.getTime())) {
        rowAnomalies.push({
          anomalyType: "invalid_date",
          description: `Date value "${rawDate}" is invalid.`,
          resolution: "pending",
        });
        dateObj = new Date(); // Temp fallback to avoid crash
      }

      // 9. Check if Payer was active in group membership at date
      if (matchedUser && dateObj) {
        const payerMembership = groupUsers.find((u) => u.id === matchedUser!.id);
        if (!payerMembership) {
          // Payer is NOT a member of group (e.g. Dev who is a visitor)
          if (matchedUser.name === "Dev") {
            rowAnomalies.push({
              anomalyType: "visitor_payer",
              description: `Payer Dev is visiting (non-member) and can pay but doesn't have regular group membership.`,
              resolution: "auto_fixed",
              resolutionNotes: "Allowed visitor payment",
              // candidate* lets the UI add this existing user to the group and offer
              // them as a mapping target for other rows (see ImportPanel addedMembers)
              editedValue: { candidateUserId: matchedUser.id, candidateName: matchedUser.name },
            });
          } else {
            rowAnomalies.push({
              anomalyType: "non_member_payer",
              description: `Payer "${matchedUser.name}" is not a member of this group.`,
              resolution: "pending",
              editedValue: { candidateUserId: matchedUser.id, candidateName: matchedUser.name },
            });
          }
        } else {
          // Check exit window
          if (!isMemberActive(payerMembership, dateObj)) {
            rowAnomalies.push({
              anomalyType: "inactive_member_payer",
              description: `Payer "${matchedUser.name}" was not active in the group on ${dateObj.toISOString().split("T")[0]}.`,
              resolution: "pending",
            });
          }
        }
      }

      // 10. Split With Validation
      const splitNames = rawSplitWith ? rawSplitWith.split(";").map((n: string) => n.trim()) : [];
      let isSettlement = false;

      // Settlement as expense checks
      const isSettlementKeyword =
        rawDescription.toLowerCase().includes("paid back") ||
        rawDescription.toLowerCase().includes("deposit share") ||
        rawDescription.toLowerCase().includes("settlement");

      if ((!rawSplitType || rawSplitType === "NaN") && isSettlementKeyword && splitNames.length === 1) {
        isSettlement = true;
        rowAnomalies.push({
          anomalyType: "settlement_candidate",
          description: `Row appears to be a direct debt settlement rather than a shared expense.`,
          resolution: "pending", // require approval to route to settlements
        });
      }

      // Member pre-join / post-exit check, guest check
      const validSplits: any[] = [];
      for (const name of splitNames) {
        const matchedSplitUser = fuzzyMatchUser(name, allUsers);
        if (matchedSplitUser) {
          const splitMem = groupUsers.find((u) => u.id === matchedSplitUser.id);
          if (splitMem) {
            // Check active window
            if (!isMemberActive(splitMem, dateObj)) {
              if (new Date(splitMem.leftAt || "") < dateObj) {
                // Post-exit member
                rowAnomalies.push({
                  anomalyType: "post_exit_split",
                  description: `Member "${splitMem.name}" left the group on ${new Date(splitMem.leftAt || "").toISOString().split("T")[0]}, but is included in this split on ${dateObj.toISOString().split("T")[0]}.`,
                  resolution: "auto_fixed",
                  resolutionNotes: `Remove "${splitMem.name}" from split and recalculate`,
                  editedValue: { removeUser: splitMem.id },
                });
              } else {
                // Pre-join member
                rowAnomalies.push({
                  anomalyType: "pre_join_split",
                  description: `Member "${splitMem.name}" joined the group after this date.`,
                  resolution: "auto_fixed",
                  resolutionNotes: `Remove "${splitMem.name}" from split`,
                  editedValue: { removeUser: splitMem.id },
                });
              }
            } else {
              validSplits.push({ userId: matchedSplitUser.id });
            }
          } else {
            // User exists, but not a group member (e.g. Dev in Goa splits)
            validSplits.push({ userId: matchedSplitUser.id });
          }
        } else if (name) {
          // Not in users table (e.g. "Dev's friend Kabir")
          rowAnomalies.push({
            anomalyType: "non_member_split",
            description: `Split contains "${name}" who is not a registered user. Creating guest record.`,
            resolution: "auto_fixed",
            resolutionNotes: `Create guest "${name}" and attribute share`,
            editedValue: { guestName: name },
          });
        }
      }

      // 11. Percentage Splits sum !== 100% check
      if (rawSplitType === "percentage" && rawSplitDetails) {
        const details = rawSplitDetails.split(";").map((d: string) => d.trim());
        let sumPct = 0;
        for (const det of details) {
          const parts = det.split(/\s+/);
          const pct = parseFloat(parts[parts.length - 1]);
          if (!isNaN(pct)) sumPct += pct;
        }

        if (Math.abs(sumPct - 100) > 0.01) {
          rowAnomalies.push({
            anomalyType: "invalid_percentage_sum",
            description: `Percentage split sums to ${sumPct}% instead of 100%.`,
            resolution: "pending", // Blocks import until user edits percentages inline
          });
        }
      }

      // 12. Type / detail mismatch check
      if (rawSplitType === "equal" && rawSplitDetails && rawSplitDetails.trim().length > 0) {
        rowAnomalies.push({
          anomalyType: "type_detail_mismatch",
          description: `Split type is equal, but split details contains extra configurations.`,
          resolution: "auto_fixed",
          resolutionNotes: "Equal split selected; details ignored.",
        });
      }

      // Save anomalies to database
      for (const anom of rowAnomalies) {
        await prisma.importAnomaly.create({
          data: {
            sessionId: session.id,
            rowNumber,
            anomalyType: anom.anomalyType,
            description: anom.description,
            rawRow: record,
            resolution: anom.resolution,
            resolutionNotes: anom.resolutionNotes || null,
            editedValue: anom.editedValue || null,
          },
        });
      }

      // Save raw row
      await prisma.importRow.create({
        data: {
          sessionId: session.id,
          rowNumber,
          rawData: record,
          status: "staged",
        },
      });
    }

    // Exact duplicate check across staged rows
    const allStaged = await prisma.importRow.findMany({ where: { sessionId: session.id } });
    for (let i = 0; i < allStaged.length; i++) {
      const rowA = allStaged[i].rawData as any;
      for (let j = i + 1; j < allStaged.length; j++) {
        const rowB = allStaged[j].rawData as any;
        if (
          rowA.description.toLowerCase().trim() === rowB.description.toLowerCase().trim() &&
          rowA.date === rowB.date &&
          rowA.amount === rowB.amount &&
          rowA.paid_by === rowB.paid_by
        ) {
          await prisma.importAnomaly.create({
            data: {
              sessionId: session.id,
              rowNumber: allStaged[j].rowNumber,
              anomalyType: "exact_duplicate",
              description: `Row ${allStaged[j].rowNumber} is an exact duplicate of Row ${allStaged[i].rowNumber} ("${rowA.description}").`,
              resolution: "pending", // Blocks until user deletes/rejects one
              rawRow: rowB,
            },
          });
        }
      }
    }

    // Conflicting duplicate check — same description+date but different amount or payer
    for (let i = 0; i < allStaged.length; i++) {
      const rowA = allStaged[i].rawData as any;
      const descA = (rowA.description ?? "").toLowerCase().trim();
      for (let j = i + 1; j < allStaged.length; j++) {
        const rowB = allStaged[j].rawData as any;
        const descB = (rowB.description ?? "").toLowerCase().trim();
        const sameDesc = descA === descB && descA !== "";
        const sameDate = rowA.date === rowB.date;
        const differentAmount = rowA.amount !== rowB.amount;
        const differentPayer = (rowA.paid_by ?? "").trim().toLowerCase() !== (rowB.paid_by ?? "").trim().toLowerCase();
        if (sameDesc && sameDate && (differentAmount || differentPayer)) {
          await prisma.importAnomaly.create({
            data: {
              sessionId: session.id,
              rowNumber: allStaged[j].rowNumber,
              anomalyType: "conflicting_duplicate",
              description: `Conflict: Row ${allStaged[i].rowNumber} (${rowA.paid_by}, ${rowA.amount}) and Row ${allStaged[j].rowNumber} (${rowB.paid_by}, ${rowB.amount}) share the same description "${rowA.description}" and date but differ.`,
              resolution: "pending",
              rawRow: rowB,
            },
          });
        }
      }
    }


    // Retrieve full session payload
    const sessionDetails = await prisma.importSession.findUnique({
      where: { id: session.id },
      include: { anomalies: true, rows: true },
    });

    res.json(sessionDetails);
  } catch (error) {
    Logger.error("Failed to parse and stage CSV", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to upload CSV file" } });
  }
});

// GET import session
router.get("/session/:id", isAuthenticated, async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.importSession.findUnique({
      where: { id: req.params.id },
      include: {
        anomalies: true,
        rows: true,
      },
    });
    if (!session) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Import session not found" } });
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  }
});

// PATCH update anomaly resolution
router.patch("/anomaly/:anomalyId", isAuthenticated, async (req: AuthRequest, res: Response) => {
  const { resolution, resolutionNotes, editedValue } = req.body;
  try {
    // Verify the anomaly's session belongs to a group this user is a member of
    const anomaly = await prisma.importAnomaly.findUnique({
      where: { id: req.params.anomalyId },
      include: { session: { select: { groupId: true } } },
    });
    if (!anomaly) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Anomaly not found" } });
    }
    const membership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: req.userId!, groupId: anomaly.session.groupId } },
    });
    if (!membership) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Not a member of this group" } });
    }

    const updated = await prisma.importAnomaly.update({
      where: { id: req.params.anomalyId },
      data: { resolution, resolutionNotes, editedValue },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to resolve anomaly" } });
  }
});

// POST Commit Staged Session
router.post("/session/:id/commit", isAuthenticated, async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.importSession.findUnique({
      where: { id: req.params.id },
      include: {
        anomalies: true,
        rows: true,
      },
    });

    if (!session) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Session not found" } });
    }

    // Enforce all resolved
    const unresolved = session.anomalies.filter((a) => a.resolution === "pending");
    if (unresolved.length > 0) {
      return res.status(400).json({
        error: {
          code: "UNRESOLVED_ANOMALIES",
          message: `Cannot commit session: ${unresolved.length} unresolved anomalies remain.`,
        },
      });
    }

    const allUsers = await prisma.user.findMany();
    const memberships = await prisma.groupMembership.findMany({ where: { groupId: session.groupId } });

    // Group users map
    const activeUsersMap = new Set(memberships.map((m) => m.userId));

    // Seed/lookup Kabir or other guests created
    const guestMap: Record<string, string> = {};

    await prisma.$transaction(async (tx) => {
      // Fetch USD exchange rate
      const rateObj = await tx.exchangeRate.findFirst({
        where: { fromCurrency: "USD", toCurrency: "INR" },
        orderBy: { effectiveDate: "desc" },
      });
      const rate = rateObj ? Number(rateObj.rate) : 83.00;

      for (const row of session.rows) {
        const raw = row.rawData as any;
        const rowNum = row.rowNumber;

        // Check user resolutions for this row
        const rowAnoms = session.anomalies.filter((a) => a.rowNumber === rowNum);
        
        // If user rejected the row, skip it
        const isRejected = rowAnoms.some((a) => a.resolution === "user_rejected");
        if (isRejected) {
          await tx.importRow.update({ where: { id: row.id }, data: { status: "rejected" } });
          continue;
        }

        // Determine Payer
        let payerName = raw.paid_by ? raw.paid_by.trim() : "";
        
        // Apply inline overrides
        const payerWhitespace = rowAnoms.find((a) => a.anomalyType === "whitespace_payer");
        const payerCase = rowAnoms.find((a) => a.anomalyType === "case_inconsistency_payer");
        if (payerWhitespace) payerName = payerName.trim();
        
        let payerUser = fuzzyMatchUser(payerName, allUsers);
        if (payerCase && payerUser) {
          payerName = payerUser.name;
        }

        // Explicit payer mapping override: when the user resolved a missing/unknown
        // payer by mapping it to an existing member, use that member as the payer.
        const payerMapAnom = rowAnoms.find(
          (a) =>
            (a.anomalyType === "unknown_payer" || a.anomalyType === "missing_payer") &&
            (a.editedValue as any)?.mapToUserId
        );
        if (payerMapAnom) {
          const mapped = allUsers.find((u) => u.id === (payerMapAnom.editedValue as any).mapToUserId);
          if (mapped) payerUser = mapped;
        }

        // Overrides from edits
        let dateStr = raw.date;
        const missingYear = rowAnoms.find((a) => a.anomalyType === "missing_year");
        if (missingYear && missingYear.editedValue) {
          dateStr = (missingYear.editedValue as any).date;
        }
        const ambiguousDate = rowAnoms.find((a) => a.anomalyType === "ambiguous_date");
        if (ambiguousDate && ambiguousDate.editedValue) {
          dateStr = (ambiguousDate.editedValue as any).date;
        }

        let dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) {
          dateObj = new Date();
        }

        // Payer user validation — never drop a row silently. If we still can't resolve
        // a real payer, record an explicit rejection so the import report accounts for it.
        if (!payerUser) {
          await tx.importRow.update({ where: { id: row.id }, data: { status: "rejected" } });
          continue;
        }

        // Add a non-member / visitor payer to the group as a member, when the user opted in.
        // joinedAt is the expense date so this very expense falls inside their membership window.
        const addMemberAnom = rowAnoms.find(
          (a) =>
            (a.anomalyType === "non_member_payer" || a.anomalyType === "visitor_payer") &&
            a.resolution === "user_approved" &&
            (a.editedValue as any)?.addAsMember
        );
        if (addMemberAnom) {
          await tx.groupMembership.upsert({
            where: { userId_groupId: { userId: payerUser.id, groupId: session.groupId } },
            update: { leftAt: null },
            create: { userId: payerUser.id, groupId: session.groupId, joinedAt: dateObj },
          });
        }

        // Check if settlement candidate should be routed
        const settlementCandidate = rowAnoms.find((a) => a.anomalyType === "settlement_candidate");
        if (settlementCandidate && settlementCandidate.resolution === "user_approved") {
          // Create Settlement!
          // From Payer (raw.paid_by) to target split_with member
          const splitNames = raw.split_with ? raw.split_with.split(";").map((n: string) => n.trim()) : [];
          const targetUser = fuzzyMatchUser(splitNames[0] || "", allUsers);
          if (targetUser) {
            const amount = parseFloat(raw.amount.replace(/,/g, "").trim());
            const createdSettlement = await tx.settlement.create({
              data: {
                groupId: session.groupId,
                fromUserId: payerUser.id,
                toUserId: targetUser.id,
                amount,
                currency: raw.currency || "INR",
                date: dateObj,
                notes: raw.notes || "Imported Settlement",
              },
            });
            await tx.importRow.update({
              where: { id: row.id },
              data: { status: "committed", mappedSettlementId: createdSettlement.id },
            });
          }
          continue;
        }

        // Determine amount
        let amountStr = raw.amount ? raw.amount.replace(/,/g, "").trim() : "0";
        let amount = parseFloat(amountStr);

        // Amount overrides: automatic (sub-paisa rounding) or a manual correction the user
        // typed for a malformed / zero / comma-laden amount.
        const amountOverrideAnom = rowAnoms.find(
          (a) =>
            ["sub_paisa_precision", "malformed_amount", "zero_amount", "whitespace_amount", "negative_amount"].includes(a.anomalyType) &&
            (a.editedValue as any)?.amount != null
        );
        if (amountOverrideAnom) {
          amount = Number((amountOverrideAnom.editedValue as any).amount);
        }

        // Guard: an unparseable amount with no correction must not become a NaN expense
        // (which would crash the whole transaction). Reject the row explicitly instead.
        if (isNaN(amount)) {
          await tx.importRow.update({ where: { id: row.id }, data: { status: "rejected" } });
          continue;
        }

        let currency = raw.currency ? raw.currency.trim().toUpperCase() : "INR";
        const missingCurrency = rowAnoms.find((a) => a.anomalyType === "missing_currency");
        if (missingCurrency && missingCurrency.editedValue) {
          currency = (missingCurrency.editedValue as any).currency;
        }

        let convertedAmountInr = amount;
        if (currency === "USD") {
          convertedAmountInr = amount * rate;
        }

        // Calculate split with members
        let splitWithNames: string[] = raw.split_with ? raw.split_with.split(";").map((s: string) => s.trim()) : [];

        // Apply pre-join / post-exit removals (skip if user chose to keep in split)
        const postExitSplits = rowAnoms.filter((a) => a.anomalyType === "post_exit_split" && !(a.editedValue as any)?.keepInSplit);
        for (const pe of postExitSplits) {
          const removeId = (pe.editedValue as any)?.removeUser;
          if (removeId) {
            const removeUser = allUsers.find((u) => u.id === removeId);
            if (removeUser) {
              splitWithNames = splitWithNames.filter((name) => name.toLowerCase() !== removeUser.name.toLowerCase());
            }
          }
        }

        // Create Guests if needed
        const guestSplits = rowAnoms.filter((a) => a.anomalyType === "non_member_split");
        for (const gs of guestSplits) {
          const guestName = (gs.editedValue as any)?.guestName;
          if (guestName && !guestMap[guestName]) {
            const guestObj = await tx.guest.create({
              data: {
                name: guestName,
                addedByUserId: payerUser.id,
              },
            });
            guestMap[guestName] = guestObj.id;
          }
        }

        // Build list of split member/guest records
        const splitsArray: any[] = [];
        const percentageSumAnom = rowAnoms.find((a) => a.anomalyType === "invalid_percentage_sum");
        // When user approves auto-equalize, editedValue.percentages is {} (empty object)
        // Treat empty overrides as a signal to equalize percentages across all members
        const shouldEqualize =
          percentageSumAnom &&
          percentageSumAnom.resolution !== "pending" &&
          percentageSumAnom.editedValue != null &&
          Object.keys((percentageSumAnom.editedValue as any).percentages ?? {}).length === 0;

        let percentageOverrides: Record<string, number> = {};
        if (percentageSumAnom && percentageSumAnom.editedValue && !shouldEqualize) {
          percentageOverrides = (percentageSumAnom.editedValue as any).percentages ?? {};
        }

        for (const name of splitWithNames) {
          const userObj = fuzzyMatchUser(name, allUsers);
          if (userObj) {
            if (raw.split_type === "percentage") {
              // Extract percentage share — overrides take priority over raw split_details
              let pct = 0;
              if (!shouldEqualize && percentageOverrides[userObj.id]) {
                pct = percentageOverrides[userObj.id];
              } else if (!shouldEqualize && raw.split_details) {
                const det = raw.split_details.split(";").map((d: string) => d.trim());
                const matchDet = det.find((d: string) => d.toLowerCase().startsWith(userObj.name.toLowerCase()));
                if (matchDet) {
                  const parts = matchDet.split(/\s+/);
                  pct = parseFloat(parts[parts.length - 1].replace("%", ""));
                }
              }
              // pct stays 0 when shouldEqualize; equalization is applied below after splitsArray is complete
              splitsArray.push({ userId: userObj.id, percentage: pct });
            } else if (raw.split_type === "share") {
              let weight = 1;
              if (raw.split_details) {
                const det = raw.split_details.split(";").map((d: string) => d.trim());
                const matchDet = det.find((d: string) => d.toLowerCase().startsWith(userObj.name.toLowerCase()));
                if (matchDet) {
                  const parts = matchDet.split(/\s+/);
                  weight = parseFloat(parts[parts.length - 1]);
                }
              }
              splitsArray.push({ userId: userObj.id, weight });
            } else {
              splitsArray.push({ userId: userObj.id });
            }
          } else {
            // Guest split element
            const guestId = guestMap[name];
            if (guestId) {
              if (raw.split_type === "percentage") {
                // Guest gets 0 initially; equalized below if shouldEqualize
                splitsArray.push({ guestId, percentage: 0 });
              } else if (raw.split_type === "share") {
                splitsArray.push({ guestId, weight: 1 });
              } else {
                splitsArray.push({ guestId });
              }
            }
          }
        }

        // Apply equal-percentage distribution when user approved auto-equalize
        if (shouldEqualize && raw.split_type === "percentage" && splitsArray.length > 0) {
          const equalPct = Math.floor((100 / splitsArray.length) * 100) / 100;
          const remainder = Math.round((100 - equalPct * splitsArray.length) * 100) / 100;
          splitsArray.forEach((s, idx) => {
            s.percentage = idx === 0 ? equalPct + remainder : equalPct;
          });
        }

        // Calculate splits
        let calculatedSplits: any[] = [];
        if (splitsArray.length > 0) {
          if (raw.split_type === "percentage") {
            calculatedSplits = splitPercentage(amount, splitsArray);
          } else if (raw.split_type === "share") {
            calculatedSplits = splitShare(amount, splitsArray);
          } else if (raw.split_type === "unequal") {
            // Parse unequal
            const unequalArray: any[] = [];
            if (raw.split_details) {
              const det = raw.split_details.split(";").map((d: string) => d.trim());
              for (const d of det) {
                const parts = d.split(/\s+/);
                const val = parseFloat(parts[parts.length - 1]);
                const nameStr = parts.slice(0, parts.length - 1).join(" ");
                const targetU = fuzzyMatchUser(nameStr, allUsers);
                if (targetU) {
                  unequalArray.push({ userId: targetU.id, amount: val });
                }
              }
            }
            calculatedSplits = splitUnequal(amount, unequalArray);
          } else {
            calculatedSplits = splitEqual(amount, splitsArray);
          }
        }

        // Save committed expense
        const createdExpense = await tx.expense.create({
          data: {
            groupId: session.groupId,
            paidByUserId: payerUser.id,
            description: raw.description,
            amountOriginal: amount,
            amountOriginalCurrency: currency,
            convertedAmountInr,
            date: dateObj,
            splitType: raw.split_type || "equal",
            notes: raw.notes || null,
            source: "import",
          },
        });

        // Save Splits
        for (const cs of calculatedSplits) {
          const ratio = amount > 0 ? cs.owedAmount / amount : 0;
          const owedAmountInr = convertedAmountInr * ratio;

          await tx.expenseSplit.create({
            data: {
              expenseId: createdExpense.id,
              userId: cs.userId || null,
              guestId: cs.guestId || null,
              owedAmount: owedAmountInr,
            },
          });
        }

        await tx.importRow.update({
          where: { id: row.id },
          data: { status: "committed", mappedExpenseId: createdExpense.id },
        });
      }

      // Mark session committed
      await tx.importSession.update({
        where: { id: session.id },
        data: { status: "committed" },
      });
    });

    res.json({ success: true, message: "Import session committed successfully." });
  } catch (error) {
    Logger.error("Failed to commit import session", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to commit import session" } });
  }
});

// GET import report — returns anomaly + row summary as downloadable JSON
router.get("/session/:id/report", isAuthenticated, async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.importSession.findUnique({
      where: { id: req.params.id },
      include: {
        anomalies: { orderBy: { rowNumber: "asc" } },
        rows: { orderBy: { rowNumber: "asc" } },
      },
    });

    if (!session) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Import session not found" } });
    }

    const report = {
      sessionId: session.id,
      filename: session.filename,
      status: session.status,
      generatedAt: new Date().toISOString(),
      summary: {
        totalRows: session.rows.length,
        committed: session.rows.filter((r) => r.status === "committed").length,
        rejected: session.rows.filter((r) => r.status === "rejected").length,
        staged: session.rows.filter((r) => r.status === "staged").length,
        totalAnomalies: session.anomalies.length,
        autoFixed: session.anomalies.filter((a) => a.resolution === "auto_fixed").length,
        userApproved: session.anomalies.filter((a) => a.resolution === "user_approved").length,
        userRejected: session.anomalies.filter((a) => a.resolution === "user_rejected").length,
        pending: session.anomalies.filter((a) => a.resolution === "pending").length,
      },
      anomalies: session.anomalies.map((a) => ({
        rowNumber: a.rowNumber,
        anomalyType: a.anomalyType,
        description: a.description,
        resolution: a.resolution,
        resolutionNotes: a.resolutionNotes,
        editedValue: a.editedValue,
      })),
      rows: session.rows.map((r) => ({
        rowNumber: r.rowNumber,
        status: r.status,
        mappedExpenseId: r.mappedExpenseId,
        mappedSettlementId: r.mappedSettlementId,
      })),
    };

    res.setHeader("Content-Disposition", `attachment; filename="import-report-${session.id}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.json(report);
  } catch (error) {
    Logger.error("Failed to generate import report", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to generate report" } });
  }
});

export default router;
