# Cola Muse Skills

[简体中文](README.md) | **English**

**Hand everyday tasks to Cola. Install with one message, then ask in plain language.**

Our goal: **give Cola the full range of Muse capabilities with a single installation.**

This community skill collection helps Cola handle everyday life and work. It currently includes **24 task skills and 1 routing skill** for subscriptions, email, calendars, travel, research, project planning, and more. Development is ongoing: not every workflow has been verified against real services. Phone, banking, and merchant services require separate connections. See the [verification report](docs/verification.md) for what has actually been tested.

This is an independent community project, with no official affiliation, partnership, or certification from Cola or Muse.

## What can I ask it to do?

Talk to Cola as you normally would:

> Review these subscription receipts, calculate my fixed monthly costs, and identify potential savings. Don't cancel anything yet.

> Turn this school notice into a family schedule. Check for rescheduling and pickup conflicts.

> Plan a five-day trip for two people, including a total budget for flights, hotels, and transportation.

> Break my project into a 90-day plan with no more than 30 minutes a day. Give me a file I can open.

You don't need to memorize skill names. The skills provide workflows for Cola; you describe the result you want.

## Get started in three steps

### 1. Open Cola

Install and sign in to [Cola](https://meetcola.com/), then check that it can answer a message. The skill collection is free. Using Cola models or third-party services may consume your plan allowance or incur service fees.

### 2. Copy this message into Cola

```text
Please install the skill collection from https://github.com/huntingrin/cola-muse-skills.
First read INSTALL.md, download the official release package, verify its files, and follow the instructions to install it in the Cola instance I'm using.
Run the installation check and tell me how many skills were installed. Do not connect accounts, purchase services, or modify other skills.
```

Cola will download the files, run the installer, and check the result. You should see **25 skills installed**. You can start using them in your next message. If Cola does not recognize them, close and reopen the app, then try again.

If Cola requests file access, check that the request is for the download folder or your current Cola skills directory before allowing it. **You do not need to paste passwords, payment information, or API keys into chat.**

> The installer supports the international edition, the China edition, and custom data directories. If multiple editions are present, Cola will first identify the one you want to use.

### 3. Try a task that needs no account connection

Copy this message:

```text
Use the Muse skills to make a three-day plan starting October 1, 2026, with no more than 30 minutes a day.
I need 45 minutes to write an outline, followed by 15 minutes to review it.
Give me the plan as a file and verify the daily time limit. Do not create reminders.
```

Expected result: 30 minutes of outlining on day one; 15 minutes of outlining and 15 minutes of review on day two; day three available as a buffer. You should receive an actual plan file.

## What do I need to connect?

| Task | What you need |
| --- | --- |
| Analyze bills, organize files, make plans | Give Cola the relevant files; no additional account required |
| Research, compare products, plan trips | Describe your requirements; web search or browsing must be available |
| Organize email, update calendars | Connect your email or calendar; see the [account connection guide](docs/connect-accounts.md) |
| Create images, videos, podcasts | The corresponding media tools and sufficient service credits |
| Book tickets, shop, request refunds, contact others | Sign in to the relevant service and specify what Cola may do; outcomes depend on that service |
| Make phone calls, connect banks, control smart devices | A compatible service connection; this project does **not** include phone lines, banking APIs, or accounts |
| Run daily tasks or ongoing monitoring | Keep the Cola runtime running; execution is not guaranteed after closing the app |

**Scheduled tasks:** Cola's current scheduled-task rules do not support automatic orders, payments, or trading. These skills follow that restriction.

## Included skills

| Area | Workflows |
| --- | --- |
| Savings and finances | Subscription audits, refunds and warranties, bill negotiation, insurance comparisons, financial records |
| Everyday administration | Email organization, appointments and paperwork, privacy deletion requests |
| Travel and shopping | Travel plans, shopping, secondhand marketplaces, meal planning and groceries |
| Home and family | Family calendars, health administration, home maintenance, event planning |
| Work and creation | Work follow-ups, research briefs, media creation, social analysis, app building |
| Ongoing tasks | Learning plans, scheduled monitoring, service connections, checks and combined workflows |

See the [skill directory](docs/skills.md) for names and examples. Skill instructions and the detailed guides are currently written in Chinese; you can ask Cola to explain or follow them in English. English task execution has not yet been separately evaluated.

## Update or uninstall

**New in v0.2.0:** Subscription audits separate past payments, auto-renewal settings, and remaining paid access. Unknown amounts and billing periods stay unknown. After a verified cancellation, a new ledger and report are generated together. Existing audit files are not automatically rewritten; a fresh audit requires the v2 evidence format. See the [release changes](docs/changes-0.2.0.md).

To update, tell Cola:

```text
Update the skill collection using INSTALL.md in huntingrin/cola-muse-skills, then run the installation check.
Preserve files I have edited and all other skills. If there is a conflict, tell me exactly which files are affected.
```

To uninstall, tell Cola:

```text
Follow the uninstall instructions in huntingrin/cola-muse-skills. Remove only skills installed by this project that I have not modified.
Do not delete my task outputs or change other skills or account connections.
```

Uninstalling skills does not revoke third-party account access or remove scheduled tasks you have created. To stop those separately, tell Cola and revoke access in the relevant service's account settings.

## Troubleshooting

| Problem | What to tell Cola |
| --- | --- |
| Skills are missing after installation | “Run the doctor check in INSTALL.md. Check the installation directory and whether the skills are enabled.” |
| Email or calendar access fails | “Check the connection status only. Tell me which official page I need to use to authorize access.” |
| The installer reports modified files | “List the conflicting files and explain how to back them up. Preserve my changes.” |
| GitHub download fails | “Retry the official repository's release download. If it still fails, report the failure; don't use an unknown mirror.” |
| A task is only partly complete | “List the completed steps with evidence, the blocked steps, and what you need to continue.” |
| Phone calls are unavailable | “Check whether a calling service is actually connected. If not, prepare a call outline without claiming a call was made.” |

For more detail, see the [installation instructions](INSTALL.md) and [test results and limitations](docs/verification.md).

## For developers

There are no npm dependencies. The installer and deterministic tools require Node.js 18+. You do not need to run `npm install`.

```sh
node scripts/validate.mjs
npm test
node install.mjs install --data-dir /path/to/test-cola --dry-run
```

When adding a capability, include inputs, acceptance criteria, and reproducible evidence. The [evaluation guide](eval/README.md) distinguishes offline tests, actual Cola agent runs, and successful tasks against live services. You can try the installer in a separate directory before installing into your personal setup.

The code and original documentation are available under the [MIT license](LICENSE). Third-party brands and materials remain the property of their respective owners.
