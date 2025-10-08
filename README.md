# IWE TextFlow

[![GitHub release](https://img.shields.io/github/v/release/KazKozDev/textflow?style=flat&logo=github)](https://github.com/KazKozDev/textflow/releases)
[![GitHub stars](https://img.shields.io/github/stars/KazKozDev/textflow?style=flat&logo=github)](https://github.com/KazKozDev/textflow/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/KazKozDev/textflow?style=flat&logo=github)](https://github.com/KazKozDev/textflow/network/members)
[![GitHub issues](https://img.shields.io/github/issues/KazKozDev/textflow?style=flat&logo=github)](https://github.com/KazKozDev/textflow/issues)
[![GitHub license](https://img.shields.io/github/license/KazKozDev/textflow?style=flat)](https://github.com/KazKozDev/textflow/blob/main/LICENSE)

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Google AI](https://img.shields.io/badge/Google_AI-Gemini_2.5_Flash-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)

AI-powered Integrated Writing Environment (IWE) with intelligent cascade architecture for professional literary editing.

## What is an IWE?

**IWE** (Integrated Writing Environment) is software that provides comprehensive functionality for writing and knowledge management for authors and information workers. Similar to how IDEs (Integrated Development Environments) serve software developers, IWEs offer writers the same efficiency and functionality benefits by enabling various document-related tasks within a single, distraction-free environment with a streamlined writing process.

**IWE TextFlow** brings this concept into the AI era, combining traditional IWE capabilities with intelligent cascade editing, automated story consistency tracking, and AI-assisted manuscript refinement.

## For Whom

**Writers** • **Editors** • **Creative Professionals**

Designed primarily for fiction editing but applicable to any long-form narrative work. If you're working on novels, short stories, screenplays, or any structured manuscript that requires consistency, style polish, and narrative coherence, this tool is for you.

---

## Core Features

### 🤖 AI Agent (TextFlow)
Intelligent editing agent powered by Google Gemini 2.5 Flash with function calling capabilities.

**Two modes of operation:**
- **Analysis Mode**: Story structure analysis, character arc tracking, pacing evaluation, continuity checks
- **Editing Mode**: Automated text improvements via Cascade Workflow (see Architecture)

**Agent capabilities:**
- `get_document_context` — retrieves manuscript text, anchors, rules, and memory
- `execute_edit_plan` — executes editing plans with automated quality checks
- `refresh_bible` — updates Story Bible with new information
- `analyze_manuscript_for_bible` — builds comprehensive Story Bible from full manuscript

### 📝 Text Editor
High-performance editor with virtualization support for manuscripts of any length.

**Key features:**
- Zoom controls for comfortable reading
- Smart text highlighting for active patches
- Auto-save to localStorage
- Inline edit mode (Cmd/Ctrl+I)
- Sentence/scene/chapter/book range selection
- Real-time word and character count

### 🔀 Patch System
Fine-grained editing with anchor-based patch tracking.

**Workflow:**
1. AI generates minimal, precise patches
2. Each patch includes `before_excerpt`, `after_proposed`, and `rationale`
3. Patches are anchored to surrounding context for reliability
4. Review in Diff Panel: Accept, Skip, or Edit
5. A/B testing support for stylistic variations
6. Sync feature to update patches if source text changes

**Hotkeys:**
- `A` — Accept patch
- `S` — Skip patch
- `E` — Edit result
- `Y` — Sync before
- `N` — Next patch
- `P` — Previous patch

### 📚 Story Bible
Auto-generated knowledge base for narrative consistency.

**Tracks:**
- **Characters**: Names, descriptions, relationships
- **World**: Locations, settings, magic systems
- **Glossary**: Terminology, recurring objects, concepts
- **Timeline**: Events in chronological order

Automatically built via agent analysis. Persistent across sessions. Editable by user.

### 🔍 Local Checks
AI-free validation for instant feedback.

**Style checks:**
- Adverb detection (words ending in `-ly`)
- Passive voice detection (`was/were/been + past participle`)

**POV checks:**
- First person vs. third person consistency
- Rule-based validation against manuscript rules

### ✏️ Proofreading Pipeline
AI-powered annotation system for copyediting stage.

**Process:**
- Runs through entire manuscript
- Generates annotations with confidence scores
- Highlights: grammar, punctuation, style inconsistencies, typos
- Designed for final pass after structural editing

Trigger: **Ctrl+R**

### 📊 Metrics Analysis
Quantitative evaluation of manuscript quality.

**Metrics tracked:**
- **Hook**: Opening strength
- **Clarity**: Prose comprehensibility
- **Tension**: Narrative drive
- **Voice**: Authorial distinctiveness
- **Pacing**: Story rhythm
- **Continuity**: Logical consistency

Before/after comparison available after edits.

### 📜 History & Versioning
Semantic versioning for all document changes.

**Features:**
- Full edit history with version tags (`v1.0.0`, `v1.1.0`, etc.)
- Rollback to any previous version
- Undo/Redo via history
- Change attribution (user vs. agent)

### 🔎 Search
Dual search modes:
- **Exact Match**: Fast literal text search
- **Semantic (AI)**: Meaning-based search across document

### 🚀 Quick Commands
Pre-built prompts for common editing tasks:

**Foundation:**
- Build Story Bible
- Update timeline consistency
- Track character development

**Structure Analysis:**
- Analyze main character arc
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
- File upload (`.txt`, `.docx`, `.pdf`)
- Import from URL with AI-powered HTML parsing

**Export formats:**
- PDF (print-ready)
- EPUB (e-readers)
- DOCX (Microsoft Word)
- IDML (InDesign)
- TXT (plain text)
- JSON (full project backup with all state)

### ⚙️ Rules & Constraints
Define manuscript-specific guidelines for AI to follow.

**Configuration:**
- Point of View (First/Third Person)
- Custom instructions
- Forbidden words/phrases
- Preferred vocabulary
- Character name constraints

Rules are automatically injected into AI system instructions.

### 📈 Agent Performance Log
Complete transparency into AI operations.

**Logs:**
- All function calls
- Tool execution times
- Token usage
- Success/failure rates

---

## Architecture

### The Cascade Workflow

TextFlow uses a **Cascade Architecture** for editing — a four-stage pipeline that ensures high-quality, auditable changes.

#### Stage 1: Analyze & Plan
- Agent receives editing request (e.g., "Remove passive voice from Chapter 3")
- Calls `get_document_context` to retrieve relevant text, rules, and memory
- Creates actionable plan (TODO list) outlining specific steps

#### Stage 2: Generate Patches
- For each plan step, agent generates minimal, precise patches
- Each patch includes:
  - `before_anchor`: Context before target
  - `before_excerpt`: Text to replace
  - `after_anchor`: Context after target
  - `after_proposed`: New text (can be array for A/B testing)
  - `rationale`: Reasoning and checks to run
- Anchors ensure patches remain valid even if document changes

#### Stage 3: Execute with Validation
- Calls `execute_edit_plan` tool with plan + patches
- Tool runs automated checks:
  - **Anchor validation**: Ensures patch location is correct
  - **Style checks**: No new passive voice, minimize adverbs
  - **POV checks**: Maintains narrative voice consistency
  - **Metrics calculation**: Before/after quality scores
- Only valid patches are applied
- Failed patches are logged with reasons

#### Stage 4: Report
- Agent receives detailed execution results
- Presents natural language summary to user
- Provides comprehensive JSON report:
  - Applied patches
  - Skipped patches (with reasons)
  - Metrics comparison
  - Story Bible updates

**Benefits:**
- **Auditability**: Every change has a rationale and validation trail
- **Safety**: Multi-layer checks prevent degradation
- **Transparency**: User sees exactly what changed and why
- **Revertibility**: All changes tracked in history with semantic versions

### Patch System Design

Patches use **anchor-based targeting** instead of line numbers:

```json
{
  "id": "patch_001",
  "before_anchor": "John walked into the",
  "before_excerpt": "was opened by him",
  "after_anchor": "and looked around",
  "after_proposed": "he opened",
  "rationale": "Remove passive voice"
}
```

**Advantages over line-based diffs:**
- Robust to concurrent edits
- Works with streaming changes
- Human-readable
- AI-native format

### State Management

**Local-first architecture:**
- All data persists to `localStorage`
- No backend required
- Export/import for portability
- Chat history, patches, Story Bible, and manuscript all saved

**State structure:**
```typescript
{
  manuscriptText: string;
  chatHistory: Message[];
  patches: Patch[];
  storyBible: StoryBible;
  manuscriptRules: ManuscriptRules;
  history: HistoryEntry[];
  annotations: Annotation[];
  performanceLog: PerformanceEntry[];
}
```

---

## Tech Stack

- **React 18** + **TypeScript** — UI framework with strict typing
- **Vite** — Build tool and dev server
- **Google Gemini 2.5 Flash** — AI model with function calling
- **react-window** — Virtualization for large documents
- **localStorage** — Persistent state management

**No backend required.** Fully client-side application.

---

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js 18+** (the project uses Node 18)
- **npm** (comes with Node.js)
- **Google AI API key** ([Get it here](https://ai.google.dev/))

### Installation

#### 1. Clone the repository

```bash
git clone https://github.com/KazKozDev/textflow.git
cd textflow
```

#### 2. Install dependencies

```bash
npm install
```

#### 3. Start the development server

```bash
npm run dev
```

The application will open at `http://localhost:5173`

### Quick Start (macOS)

**For macOS users:** Simply double-click the `Start.command` file in the project root. This will automatically:
- Install dependencies (if needed)
- Start the development server
- Open the app in your default browser

### Configuration

#### API Key Setup

Add your Google AI API key to the application:
1. Open the app in your browser
2. Navigate to the **Settings/Import** tab
3. Enter your API key when prompted
4. The key will be saved in browser's localStorage

Alternatively, you can modify the code to read the API key from an environment variable.

### Development

```bash
# Start dev server (port 5173)
npm run dev
```

### Build

```bash
# Create production build
npm run build

# Preview production build
npm run preview
```

### Docker

```bash
# Build and run with Docker
docker build -t manuscript-editor .
docker run -p 5173:5173 manuscript-editor
```

---

## Usage

### Basic Editing Workflow

1. **Load manuscript**: Import file or paste text
2. **Set rules**: Configure POV, constraints, vocabulary (optional)
3. **Select range**: Choose Selection/Scene/Chapter/Book
4. **Give instruction**: Use Quick Commands or write custom prompt
5. **Review patches**: Accept, skip, or edit in Diff Panel
6. **Build Story Bible**: Run "Build Story Bible" command for consistency tracking

### Advanced Features

**Inline Edit (Cmd+I):**
- Select text → Cmd+I → Enter instruction → AI replaces instantly
- No patch review, direct application

**A/B Testing:**
- Agent can provide multiple variants in `after_proposed`
- System automatically scores and selects best option
- User can override via Edit mode

**Semantic Search:**
- Find concepts, not just exact text
- Example: Search "betrayal" finds thematically related passages

**Metrics Tracking:**
- Run "Update Metrics" after major edits
- Compare scores before/after
- Track improvement over time

---

## Project Status

**Current version:** v1.0.0 (semantic versioning)

**Production-ready features:**
- ✅ AI Chat Agent with Cascade Workflow
- ✅ Patch System with anchors
- ✅ Story Bible auto-generation
- ✅ Local Checks (style + POV)
- ✅ Proofreading Pipeline
- ✅ Metrics Analysis
- ✅ History & Versioning
- ✅ Import/Export (6 formats)
- ✅ Rules & Constraints
- ✅ Performance Monitoring

**See ROADMAP.md for planned features.**

---

## Contributing

Contributions welcome. Please:
1. Fork repository
2. Create feature branch
3. Add tests if applicable
4. Submit pull request

---

## License

MIT License

---

## Acknowledgments

Built with Google Gemini API. Inspired by Cascade architecture from modern AI-assisted development tools.