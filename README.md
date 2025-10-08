
<div align="center">
  <img height="80" alt="txt" src="https://github.com/user-attachments/assets/d0c7d6d9-d242-442f-9cee-c5f356cc8ddc" />
</div>
<br>

<div align="center">
When Intelligence Meets Prose
</div>
<br>
TextFlow is an LLM-powered Integrated Writing Environment (IWE) for professional literary editing — just as Windsurf and Cursor bring cascaded AI assistance to code, TextFlow brings the same approach to prose.


### Who Is This For?

- **Writers** — working on novels and long-form fiction
- **Editors** — professional literary editing
- **Screenwriters** — screenplay and dramatic works
- **Authors** — any structured manuscript requiring consistency

TextFlow is a set of LLM tools for text editing. It is a convenient environment for working with manuscripts. It features a natural language chat interface for agent control, similar to Visual Studio Copilot or Cursor.

The system includes Story Bible, which automatically generates and maintains knowledge bases for characters, world-building, and timeline consistency. Every change goes through the Patch System, allowing you to review changes with a clear rationale for each change. Quality Metrics offers a quantitative assessment of the manuscript based on parameters such as clarity, tension, and pacing, while a complete version history with semantic versioning provides full rollback capability.

<img width="1633" height="864" alt="Screenshot 2025-10-08 at 18 54 21" src="https://github.com/user-attachments/assets/4e355bdf-dc9e-4ef8-a27e-deecf879c39f" />


**How it works:**
- Type natural language commands: "Remove passive voice from Chapter 3" or "Make the dialogue more authentic"
- Agent understands context and manuscript structure
- Get instant feedback and execution plans
- Review changes before applying them

**Examples:**
```
"Strengthen the opening hook"
"Add more sensory details to the forest scene"
"Check if Emma's character development is consistent"
"Improve pacing in the action sequence"
"Find all instances of telling instead of showing"
```

### 🤖 Cascade AI Agent

**The heart of TextFlow** — an intelligent agent that processes editing requests through a multi-stage cascade workflow:

**Stage 1: Analyze & Plan**
- Receives editing request from chat
- Analyzes manuscript context
- Creates structured action plan

**Stage 2: Generate Patches**
- Produces minimal, precise edits
- Each patch includes before/after and rationale
- Anchored to context for reliability

**Stage 3: Execute with Validation**
- Automatic quality checks
- Style consistency validation
- POV preservation
- Metrics calculation

**Stage 4: Report & Review**
- Detailed execution summary
- Applied vs. skipped patches
- Quality metrics comparison
- User-friendly review interface

**Two Operating Modes:**

**Analysis Mode:**
- Story structure analysis
- Character arc tracking
- Pacing evaluation
- Continuity checks

**Editing Mode:**
- Cascaded text improvements
- Style refinement
- Passive voice elimination
- Adverb reduction

### 📝 Professional Editor

- Virtualized rendering for manuscripts of any size
- Inline edit mode (Cmd/Ctrl+I)
- Range selection: Sentence / Scene / Chapter / Book
- Auto-save to localStorage
- Active patch highlighting
- Real-time word & character count

### 🔀 Patch System

Fine-grained editing with full transparency:

1. AI generates minimal, precise patches
2. Each patch anchored to surrounding context
3. You see: **what was** → **what will be** → **why**
4. Accept, Skip, or Edit manually
5. A/B testing for stylistic variations

### 📚 Story Bible (Auto-Generated)

AI-powered consistency tracking:

- **Characters** — names, descriptions, relationships
- **World** — locations, settings, magic systems
- **Glossary** — terminology, objects, concepts
- **Timeline** — chronological event tracking

### 📊 Quality Metrics

Quantitative manuscript evaluation:

- **Hook** — opening strength
- **Clarity** — prose comprehensibility
- **Tension** — narrative drive
- **Voice** — authorial distinctiveness
- **Pacing** — story rhythm
- **Continuity** — logical consistency

Before/after comparison for tracking improvements.

### 🚀 Quick Commands

Pre-built prompts for common editing tasks (accessible via chat):

**Foundation:**
- Build Story Bible
- Update timeline consistency
- Track character development

**Structure Analysis:**
- Analyze character arcs
- Identify plot holes
- Check continuity errors

**Story Flow:**
- Evaluate pacing and tension
- Strengthen opening hook
- Improve scene transitions

**Scene Polish:**
- Review dialogue authenticity
- Add sensory details
- Enhance character voice

**Line Editing:**
- Tighten prose
- Fix passive voice
- Remove redundant adverbs

### 📦 Import/Export

**Import:**
- Files: `.txt`, `.docx`, `.pdf`
- URLs with AI-powered HTML parsing

**Export formats:**
- `PDF` — print-ready
- `EPUB` — e-readers
- `DOCX` — Microsoft Word
- `IDML` — Adobe InDesign
- `TXT` — plain text
- `JSON` — full project backup

---

## 🏗️ Cascade Architecture

### Why Cascade?

Traditional AI editors work like this:
```
User Request → AI Response → Done
```

TextFlow's cascade ensures quality:
```
Chat Command → Analyze → Generate → Validate → Report
```

### The Four-Stage Pipeline

#### Stage 1: Analyze & Plan
- Agent receives editing instruction via chat
- Calls `get_document_context` to retrieve text, rules, and memory
- Creates actionable TODO list with specific steps

#### Stage 2: Generate Patches
For each plan item, the agent generates:
```json
{
  "before_anchor": "context before target",
  "before_excerpt": "text to replace",
  "after_anchor": "context after target",
  "after_proposed": "new text",
  "rationale": "why this change improves the text"
}
```

#### Stage 3: Execute with Validation
Calls `execute_edit_plan` tool which runs:
- ✅ Anchor validation — ensures correct location
- ✅ Style checks — no new passive voice, minimal adverbs
- ✅ POV checks — maintains narrative consistency
- ✅ Metrics calculation — before/after quality scores

Only validated patches are applied.

#### Stage 4: Report
Agent presents results in chat:
- Natural language summary
- Comprehensive JSON report
- Applied patches with reasons
- Skipped patches with explanations
- Metrics comparison

### Benefits of Cascade Architecture

**🔍 Auditability** — Every change has rationale and validation trail

**🛡️ Safety** — Multi-layer checks prevent quality degradation

**📖 Transparency** — Users see exactly what changed and why

**⏮️ Revertibility** — All changes tracked in semantic version history

**🎯 Precision** — Anchor-based patches remain valid even during concurrent edits

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** ([download](https://nodejs.org/))
- **Google AI API key** ([get here](https://ai.google.dev/))
- **Safari browser** (recommended for best performance and compatibility)

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/KazKozDev/textflow.git
cd textflow
```

**2. Install dependencies**
```bash
npm install
```

**3. Start development server**
```bash
npm run dev
```

App opens at: `http://localhost:5173`

### Quick Start (macOS)

Double-click `Start.command` file — it will automatically:
- Install dependencies
- Start dev server
- Open app in browser

### API Key Configuration

1. Open the app
2. Go to **Settings/Import** tab
3. Enter your Google AI API key
4. Key saves to browser localStorage

---

## 📖 Usage

### Basic Workflow

1. **Load manuscript** — import file or paste text
2. **Set rules** — configure POV, constraints, vocabulary
3. **Open chat** — start conversation with AI agent
4. **Give commands** — use natural language: "Fix passive voice in Chapter 2"
5. **Review cascade** — see AI's plan, patches, and validation results
6. **Accept or edit** — review patches one by one
7. **Build Story Bible** — ensure consistency tracking

### Chat Interface Examples

**Structural editing:**
```
"Analyze the pacing of Chapter 5"
"Check if the character arc is consistent throughout"
"Find plot holes in the mystery storyline"
```

**Style improvements:**
```
"Remove passive voice from the selected scene"
"Make the dialogue more natural and authentic"
"Add sensory details to the description"
```

**Consistency checks:**
```
"Verify that Emma's eye color is consistent"
"Check timeline continuity for the battle scene"
"Update Story Bible with new character information"
```

### Inline Editing

Quick edits without patch review:

1. Select text
2. Press `Cmd+I` (or `Ctrl+I`)
3. Enter instruction
4. AI replaces instantly

### Semantic Search

Search by meaning, not just keywords:

- Search "betrayal" finds thematically related passages
- AI understands context and concepts

---

## 🛠️ Tech Stack

- **React 18** + **TypeScript** — UI with strict typing
- **Vite** — build tool and dev server
- **Google Gemini 2.5 Flash** — AI model with function calling
- **react-window** — virtualization for large documents
- **localStorage** — persistent state management

**No backend required** — fully client-side application.

---

If you like this project, please give it a star ⭐

For questions, feedback, or support, reach out to:

[Artem KK](https://www.linkedin.com/in/kazkozdev/) | MIT [LICENSE](LICENSE) 
