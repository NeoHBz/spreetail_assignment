## Assignment: Build a Shared Expenses App
 ### Context

You are expected to act as both Product Manager and Developer.
Four flat mates — Aisha, Rohan, Priya, and Meera — have tracked shared expenses in a spreadsheet
since February. Dev joined them for a trip where part of the spending was in US dollars. Meera moved out at the end of March, and Sam moved in mid-April. The spreadsheet is now a mess: inconsistent formats, duplicate entries, a settlement logged as an expense, and no agreement on who owes whom.

They have asked you to build them a proper app. Their full spreadsheet export is provided with this assignment as `csv_inputs/expenses_export.csv`. Each flat mate also gave you one request:

- Aisha: “I just want one number per person. Who pays whom, how much, done.”
- Rohan: “No magic numbers. If the app says I owe ₹2,300, I want to see exactly which expenses
make that up.”
- Priya: “Half the trip was in dollars. The sheet pretends a dollar is a rupee. That can’t be right.”
- Sam: “I moved in mid-April. Why would March electricity affect my balance?”
- Meera: “Clean up the duplicates — but I want to approve anything the app deletes or changes.”

You will be tested on the technical aspects of your submission and on your understanding of your own decisions. This role is not for a prompt engineer but a full-fledged software engineering intern.

### Goal
Build and deploy a shared expenses app for this group in 2 days.
You are encouraged to use an AI tool as your primary development collaborator. You remain responsible for every line you submit.

#### Minimum product requirements:
- 1. Login module
- 2. Create and manage groups, where membership can change over time (members join and leave)
- 3. Create and manage expenses
  - 1. Support every split type that appears in the CSV
  - 2. Group wise balances and individual balance summary
  - 3. Settle debts or record payments
- 4. Import expenses_export.csv through the app (see below)
- 5. Use relational DBs only

### Core Requirement: The Data Import
Your app must include an import feature that ingests expenses_export.csv exactly as provided. Editing the CSV by hand before importing is not allowed.
The file contains at least 12 deliberate data problems. We have the full list. For each problem, your importer must:

1. Detect it
2. Surface it to the user
3. Handle it according to a policy you choose and document

A crashed import and a silent guess are both failing answers. Examples of questions the data will force you to answer:
- Is a negative amount an error or a refund? 
- If two people logged the same dinner with different amounts, which row wins? 
- Does someone who moved out still owe expenses dated after they left?

### Required Deliverables
1. Public deployed app URL
2. GitHub repository with a meaningful commit history (a single bulk commit is a red flag)
3. README.md with setup instructions and the AI used
4. SCOPE.md — your anomaly log (every data problem you found in the CSV and how you handled it) and your database schema
5. DECISIONS.md — a decision log: each significant decision, the options considered, and why you chose what you chose
6. Import report — produced by your app when it ingests the CSV, listing every anomaly detected and the action taken
7. AI_USAGE.md — the AI tools you used, your key prompts, and at least three concrete cases where the AI produced something wrong, how you caught it, and what you changed


### Important Evaluation Note

Shortlisted candidates will attend a 45-minute live session with the project open. We will:
- Pick anomalies from the CSV and ask you to trace, in your code, exactly what happens to them
- Ask you to modify a feature live (for example, change the rounding rule, or add a new split type)
- Point at any line in your repository and ask why it exists
- Walk through your balance calculation by hand for one member

A polished app you cannot navigate scores lower than a rough app you understand completely.
Submitting code you have not read will fail the live session regardless of how good the app looks.

### Final Note

We are not evaluating whether your product matches one we have in mind. Two strong submissions
may look like nothing alike.

We are evaluating whether you can:
- Understand a real, messy problem
- Make and explain product and engineering decisions
- Handle imperfect data deliberately rather than silently
- Direct an AI agent effectively while remaining the engineer of record
- Build and deploy a working app
- Explain every part of what you submitted
