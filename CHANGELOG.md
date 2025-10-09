# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **License updated** from MIT to Business Source License 1.1
  - Free for non-production use (personal projects, research, education)
  - Production use requires commercial license
  - Automatically converts to Apache 2.0 on January 1, 2029

## [1.0.0] - 2025-10-08

### Added

#### Core Features
- **AI Agent (TextFlow)** powered by Google Gemini 2.5 Flash
  - Analysis Mode: story structure analysis, character arc tracking, pacing evaluation, continuity checks
  - Editing Mode: automated text improvements via Cascade Workflow
  - Function calling capabilities: `get_document_context`, `execute_edit_plan`, `refresh_bible`, `analyze_manuscript_for_bible`

- **Text Editor** with virtualization support
  - Zoom controls for comfortable reading
  - Smart text highlighting for active patches
  - Auto-save to localStorage
  - Inline edit mode (Cmd/Ctrl+I)
  - Sentence/scene/chapter/book range selection
  - Real-time word and character count

- **Patch System** with anchor-based tracking
  - Minimal, precise patches with before/after excerpts
  - Rationale for each change
  - Diff Panel with Accept/Skip/Edit controls
  - A/B testing support for stylistic variations
  - Sync feature for source text changes
  - Keyboard shortcuts (A, S, E, Y, N, P)

- **Story Bible** auto-generation
  - Character tracking (names, descriptions, relationships)
  - World building (locations, settings, magic systems)
  - Glossary (terminology, objects, concepts)
  - Timeline management
  - Persistent across sessions, user-editable

- **Local Checks** (AI-free validation)
  - Adverb detection
  - Passive voice detection
  - POV consistency checks (first/third person)

- **Proofreading Pipeline**
  - AI-powered annotation system
  - Grammar, punctuation, style checks
  - Confidence scores
  - Triggered via Ctrl+R

- **Metrics Analysis**
  - Hook, Clarity, Tension, Voice, Pacing, Continuity
  - Before/after comparison

- **History & Versioning**
  - Semantic versioning (v1.0.0 format)
  - Full edit history
  - Rollback capability
  - Undo/Redo
  - Change attribution (user vs. agent)

- **Search**
  - Exact match (literal text)
  - Semantic search (AI-powered, meaning-based)

- **Quick Commands**
  - Pre-built prompts for common tasks
  - Foundation, Structure Analysis, Story Flow, Scene Polish, Line Editing categories

- **Import/Export**
  - Import: .txt, .docx, .pdf, URL with HTML parsing
  - Export: PDF, EPUB, DOCX, IDML, TXT, JSON (full backup)

- **Rules & Constraints**
  - POV configuration
  - Custom instructions
  - Forbidden/preferred words
  - Character name constraints

- **Agent Performance Log**
  - Function call tracking
  - Execution times
  - Token usage
  - Success/failure rates

#### Architecture
- **Cascade Workflow** - four-stage editing pipeline (Analyze & Plan → Generate Patches → Execute with Validation → Report)
- **Local-first** architecture with localStorage persistence
- **No backend required** - fully client-side application

#### Tech Stack
- React 18 + TypeScript
- Vite 6.2 build tool
- Google Gemini 2.5 Flash AI model
- react-window for virtualization

#### Documentation
- Comprehensive README with architecture details
- USER_GUIDE for end users
- ROADMAP for future features
- Business Source License 1.1
- Quick start script (Start.command) for macOS

### Initial Release
This is the first stable release of IWE TextFlow, providing a complete integrated writing environment for fiction editing and long-form narrative work.

[1.0.0]: https://github.com/KazKozDev/textflow/releases/tag/v1.0.0

