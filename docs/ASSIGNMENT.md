Build an analytical dashboard with an AI coding agent

This exercise gives us a concrete project to discuss: the problem you chose, what your dashboard helps a user learn, and how you worked with an agent and Git to reach a presentable MVP. The project is intentionally open ended so we can see your judgment.

# About Intelligent Audit

Intelligent Audit helps shippers understand and control transportation costs. Our technology audits freight and parcel invoices, identifies billing discrepancies, and turns shipping data into insights for better decisions. Your project does not need to use logistics data; choose a problem you find compelling.

# The assignment

Choose a real problem or decision that interests you, find or create a suitable dataset, and build an analytical dashboard that helps a specific user explore it. Explain who that user is and what questions the dashboard answers. Use an AI coding agent as part of your workflow. The finished application must run in Docker and be usable by a reviewer on a local machine.

Aim for roughly three to five hours of focused work. Stop when you have an MVP you would be comfortable demonstrating. We do not expect a production system, a polished design system, or an exhaustive dataset. You do not need to exhaust your agent’s token allowance; we care about the choices you make within a reasonable timebox.

# What to build

- Use Python for a substantive part of the project, such as data collection, processing, analysis, or the backend. The dashboard itself may use another language, such as TypeScript, if that helps you create a more feature rich and visually polished experience. Present useful analysis rather than raw records or unexplained charts, with meaningful metrics and at least one way to filter, segment, or aggregate the data.

- A clearly defined problem, audience, and data source. State the main insight or decision the dashboard is meant to support, and note important data limitations.

- A Dockerfile and, if needed, a Docker Compose file. A reviewer should be able to start the app with the exact command in your README and open it at a documented local URL.

- A small, reproducible dataset or a dependable data setup path. If the app normally fetches external data, provide a local sample or fallback so the review does not depend on a live service.

# Your development process

Commit your work to a Git repository with a history that shows the project evolving. We will read the commits, so use descriptive messages and commit at meaningful points rather than submitting a single final snapshot.

Commit a readable record of the prompts and interactions with your coding agent in the repository, for example under docs/agent-log/. An export or chronological Markdown log is fine. Include your prompts, the agent’s substantive responses, and enough context to connect major decisions or code changes to the conversation. If your tool cannot export a full transcript, reconstruct the relevant exchanges faithfully and say so. Remove API keys, credentials, personal information, and unrelated private context before committing. You do not need to provide hidden model reasoning.

# Submission

- Share a repository link or an archive that preserves the complete Git history, including the agent interaction log.

- In README.md, give the one or two commands to run the app, the local URL, the problem and intended user, data provenance, key choices, known limitations, and what you would improve next.

- Keep setup practical: a reviewer should not need paid accounts, private credentials, or manual database configuration to see the MVP.

Optional bonus: Useful data gathered through web scraping earns additional credit. If you use it, document the source, collection method, and limitations; keep the app runnable from the included sample data.

# Discussion after submission

Be ready to walk us through why you chose the problem, a useful insight from the dashboard, one decision you changed after reviewing an agent response, and what you would do next with more time. We will use the repository and the MVP to ground that conversation.
