# 🎓 Study Planner System

> **Smart curriculum planning & unit matching for multi‑version study planners**

[![GitHub Release](https://github.com/NKXK26/Study-Planner-System/releases)]


---

## 📥 Download & Install

**Get the latest installer from the right sidebar → [Releases](https://github.com/yourusername/study-planner/releases)**

| OS | Installer |
|----|------------|
| **Windows** | `StudyPlanner-Setup-x64.exe` |
---

## ✨ Features

### ✅ For Academic Advisors & Students

- **Upload study planner PDF** – automatically extracts unit codes and names.
- **Colour‑to‑unit‑type mapping** – map colours (Core, Elective, Major, WIL) before parsing.  
- **Instant XLSX export** – download a clean Excel file with units & assigned types.
- **Student transcript import** – upload Anthology `All Results` Excel file → auto‑populates completed units.
- **Smart unit matching** – compares completed units against any study planner (by intake, major, version).
- **Manual planner selector** – pick any planner from the database (no more hardcoded majors).
- **Change‑of‑major simulation** – see how many units you already have for another major, and what’s missing.
- **Side‑by‑side version comparison** – compare your progress against old and new planners.
- **Save to database** – store your personalised study planner for future access.

### 🧠 Under the Hood

- PDF text extraction + code‑splitting recovery (fixes broken unit codes across lines)
- Colour extraction from PDF text blocks (PyMuPDF backend)
- Dynamic major/degree support (future‑proof database design)
- Privacy‑first: transcript data can be used session‑only (no permanent storage)

---

## 🚀 Quick Start

### 1. Install the application

Download the installer for your OS from the [Releases page](https://github.com/yourusername/study-planner/releases/latest) and run it.

### 2. Launch & log in

Use your university credentials (SSO) or a local account (depending on deployment).

### 3. Upload a study planner PDF

- Click **“Upload PDF”** – the system will extract all coloured text blocks.
- A modal will ask you to **map each colour to a unit type** (Core, Elective, etc.).
- After confirming, the PDF is parsed and units are matched against the database.

### 4. Import a student transcript

- From the student view, click **“Import Transcript”**.
- Select the `All Results.xlsx` file downloaded from Anthology.
- The system will automatically list all completed units (unit code, name, grade, credits).

### 5. Match & simulate

- Choose a target study planner (auto‑suggested or manually from dropdown).
- See **matched units** (green), **missing units** (red), and **elective breakdown**.
- For change‑of‑major: select a different major/planner → instantly see remaining requirements.

### 6. Export or save

- Download an **XLSX report** for record‑keeping.
- Or click **“Save to Database”** to store the personalised planner.

---

## 🧪 Demo Workflow (GIF)

> *Screenshots / GIF placeholder – show PDF upload → colour mapping → transcript import → match results → XLSX export.*

---

## 🛠️ Development & Building from Source

```bash
git clone https://github.com/yourusername/study-planner.git
cd study-planner
npm install
npm run dev           # web version
npm run electron:serve # desktop version