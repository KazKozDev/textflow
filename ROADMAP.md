# 🗺️ Manuscript Editor - Roadmap to Windsurf-like Experience

## ✅ Уже реализовано

### Core Features
- [x] **AI Chat Agent** - Book-Cascade с function calling
- [x] **Patch System** - точечные правки с якорями (anchors)
- [x] **Diff Panel** - сравнение before/after с Accept/Skip/Edit
- [x] **History & Versioning** - semantic versioning (v1.0.0)
- [x] **Story Bible** - автоматическая база знаний (characters, world, glossary, timeline)
- [x] **Local Checks** - style (adverbs, passive voice) и POV проверки
- [x] **Annotations Pipeline** - AI-аннотации с confidence scores
- [x] **Metrics Analysis** - Readability & Coherence scores
- [x] **Auto-save** - localStorage persistence
- [x] **Project Backup** - export/import полного состояния (.json)
- [x] **Multiple Export Formats** - PDF, EPUB, DOCX, IDML, TXT
- [x] **Import from URL/File** - с AI-парсингом HTML
- [x] **Performance Monitoring** - лог всех AI tool calls
- [x] **Virtualized Editor** - react-window для больших текстов
- [x] **Hotkeys** - A/S/E/N/U, Ctrl+R
- [x] **Range Selector** - Selection/Scene/Chapter/Book
- [x] **A/B Testing** - multiple variants в after_proposed

---

## 🎯 Priority 1: Critical for Windsurf-like UX

### 1. **Inline Edit Mode** (Cmd+I)
**Status:** 🔴 Not Started  
**Effort:** Medium (3-5 days)  
**Impact:** 🔥 Critical

**What:**
- Выделить текст → Cmd+I → быстрый промпт → мгновенное применение
- Без перехода в чат, без diff panel
- Inline input field прямо над выделением

**Implementation:**
```typescript
// New component: InlineEditPopup
- Position: absolute, над выделенным текстом
- Input field с автофокусом
- Streaming response прямо в редактор
- Esc для отмены, Enter для применения
```

**Files to modify:**
- `index.tsx` - добавить InlineEditPopup component
- `index.tsx` - добавить selection tracking
- `index.css` - стили для popup

---

### 2. **Streaming Edits** (Real-time Updates)
**Status:** 🔴 Not Started  
**Effort:** Medium (4-6 days)  
**Impact:** 🔥 Critical

**What:**
- Видеть как AI пишет изменения в реальном времени
- Не ждать полной генерации патча
- Как GitHub Copilot или Cursor

**Implementation:**
```typescript
// Use Gemini streaming API
const stream = await ai.models.generateContentStream({...});
for await (const chunk of stream) {
  // Update editor in real-time
  updateEditorWithChunk(chunk);
}
```

**Files to modify:**
- `index.tsx` - добавить streaming support в chat.sendMessage
- `index.tsx` - добавить real-time patch application
- Добавить визуальный индикатор (мигающий курсор)

---

### 3. **Rules & Constraints System**
**Status:** 🔴 Not Started  
**Effort:** Medium (3-4 days)  
**Impact:** 🔥 Critical

**What:**
- Файл `.manuscriptrules` или UI для правил
- Примеры: "Always write in third person", "Character names: John, Mary", "Style: Hemingway"
- AI автоматически учитывает правила

**Implementation:**
```typescript
type ManuscriptRules = {
  pov: 'first' | 'third';
  style: string; // "Hemingway", "Tolkien", etc.
  constraints: string[]; // ["Don't change character names", "Keep timeline consistent"]
  vocabulary: { forbidden: string[]; preferred: string[] };
  characters: { name: string; aliases: string[] }[];
};

// New tab in Sidebar: "Rules"
// Load rules into AI system instruction
```

**Files to modify:**
- `index.tsx` - добавить Rules type и state
- `index.tsx` - новая вкладка "Rules" в Sidebar
- `index.tsx` - inject rules в systemInstruction
- localStorage для сохранения правил

---

### 4. **Multi-file/Chapter Support**
**Status:** 🔴 Not Started  
**Effort:** Large (7-10 days)  
**Impact:** 🔥 Critical

**What:**
- Работать с несколькими главами одновременно
- File tree в левой панели
- Cascade может редактировать 5+ глав за раз

**Implementation:**
```typescript
type Chapter = {
  id: string;
  title: string;
  text: string;
  order: number;
};

type Book = {
  chapters: Chapter[];
  metadata: Metadata;
  bible: Bible;
};

// New component: FileTree
// New component: TabBar (открытые главы)
// Modify: Editor to support multiple documents
```

**Files to modify:**
- `index.tsx` - полная реструктуризация state (Book вместо manuscriptText)
- Новый компонент FileTree
- Новый компонент TabBar
- localStorage для multi-file state

---

### 5. **AI Chat Memory (Persistent Context)**
**Status:** 🔴 Not Started  
**Effort:** Small (1-2 days)  
**Impact:** 🔥 Critical

**What:**
- Сохранять историю чата между сессиями
- AI помнит предыдущие разговоры
- Контекст не теряется при перезагрузке

**Implementation:**
```typescript
// Save chatMessages to localStorage
// Load on mount
// Add "Clear Chat History" button
```

**Files to modify:**
- `index.tsx` - добавить chatMessages в saveToLocalStorage
- `index.tsx` - восстановление chatMessages из savedState
- Кнопка "Clear Chat" в ChatPanel header

---

## 🚀 Priority 2: Important for Productivity

### 6. **Command Palette** (Cmd+K)
**Status:** 🔴 Not Started  
**Effort:** Medium (3-4 days)  
**Impact:** 🔥 High

**What:**
- Cmd+K → поиск по всем командам
- "Run Bible Check", "Export Chapter", "Switch to Chapter 3"
- Fuzzy search

**Implementation:**
```typescript
// New component: CommandPalette
// Modal overlay с input
// List of all commands with shortcuts
// Fuzzy search library (fuse.js)
```

---

### 7. **Undo/Redo Stack** (Ctrl+Z/Ctrl+Shift+Z)
**Status:** 🟡 Partial (есть History, но не классический undo)  
**Effort:** Medium (2-3 days)  
**Impact:** 🔥 High

**What:**
- Классический undo/redo для каждого изменения
- Не через версии, а через детальный stack
- Показывать что будет отменено

**Implementation:**
```typescript
type UndoAction = {
  type: 'text_change' | 'patch_apply' | 'annotation_accept';
  before: any;
  after: any;
  timestamp: Date;
};

const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
```

---

### 8. **Context Panel** (Explicit Context Control)
**Status:** 🔴 Not Started  
**Effort:** Medium (3-4 days)  
**Impact:** 🔥 High

**What:**
- Показывать что в контексте AI
- Добавлять/убирать главы, персонажей, заметки
- Видеть размер контекста (tokens)

**Implementation:**
```typescript
// New component: ContextPanel
// Checkbox list: chapters, bible entries, notes
// Token counter
// "Add to context" button для любого элемента
```

---

### 9. **Semantic Search**
**Status:** 🔴 Not Started  
**Effort:** Large (5-7 days)  
**Impact:** 🔥 High

**What:**
- Поиск по смыслу, не только по тексту
- "Найди все сцены где Джон злится"
- Использовать embeddings (Gemini Embedding API)

**Implementation:**
```typescript
// Generate embeddings for each paragraph
// Store in localStorage or IndexedDB
// Search using cosine similarity
// UI: search bar with "Semantic" toggle
```

---

### 10. **AI Autocomplete** (Supercomplete)
**Status:** 🔴 Not Started  
**Effort:** Large (6-8 days)  
**Impact:** 🔥 High

**What:**
- AI предлагает продолжение при печати
- Tab для принятия
- Как GitHub Copilot

**Implementation:**
```typescript
// Debounced AI call on text change
// Show suggestion as gray text
// Tab to accept, Esc to dismiss
// Use Gemini streaming for low latency
```

---

## 💡 Priority 3: Advanced Features

### 11. **Flows** (Saved Cascades)
**Status:** 🔴 Not Started  
**Effort:** Medium (4-5 days)  
**Impact:** Medium

**What:**
- Сохранять цепочки действий
- "Вычитка главы" = Run Linter → Fix Style → Check POV → Update Bible
- Применять к любой главе одной кнопкой

---

### 12. **Batch Operations**
**Status:** 🔴 Not Started  
**Effort:** Medium (3-4 days)  
**Impact:** Medium

**What:**
- Применить правку ко всем похожим местам
- "Убрать пассив во всех главах"
- "Заменить имя персонажа везде"

---

### 13. **Side-by-side Diff View**
**Status:** 🟡 Partial (есть before/after, но не side-by-side)  
**Effort:** Small (1-2 days)  
**Impact:** Medium

**What:**
- Два столбца: before | after
- Подсветка изменений на уровне слов
- Как в GitHub

---

### 14. **AI Model Selection**
**Status:** 🔴 Not Started  
**Effort:** Small (1-2 days)  
**Impact:** Medium

**What:**
- Выбор модели в UI
- Gemini Flash (быстро), Gemini Pro (качество)
- Разные модели для разных задач

---

### 15. **Minimap**
**Status:** 🔴 Not Started  
**Effort:** Medium (3-4 days)  
**Impact:** Low

**What:**
- Визуальная карта документа справа
- Подсветка проблемных мест
- Клик для навигации

---

### 16. **Breadcrumbs Navigation**
**Status:** 🔴 Not Started  
**Effort:** Small (1 day)  
**Impact:** Low

**What:**
- Book → Chapter 3 → Scene 2 → Paragraph 5
- Клик для навигации

---

### 17. **Workspace Management**
**Status:** 🔴 Not Started  
**Effort:** Large (5-7 days)  
**Impact:** Medium

**What:**
- Несколько книг/проектов
- Переключение между ними
- Отдельный localStorage для каждого

---

### 18. **Collaborative Editing**
**Status:** 🔴 Not Started  
**Effort:** Very Large (10-15 days)  
**Impact:** Low (nice to have)

**What:**
- WebSocket для real-time collaboration
- Cursor positions других пользователей
- Conflict resolution

---

### 19. **Version Control (Git Integration)**
**Status:** 🔴 Not Started  
**Effort:** Very Large (10-15 days)  
**Impact:** Low (nice to have)

**What:**
- Коммиты глав
- Ветки для альтернативных сюжетов
- Diff view между коммитами

---

### 20. **External Tools Integration**
**Status:** 🔴 Not Started  
**Effort:** Medium (4-5 days)  
**Impact:** Medium

**What:**
- Grammarly API
- LanguageTool API
- Spell checker
- Автоматический запуск после правок

---

## 📊 Summary

### Must Have (Priority 1) - 5 features
- Inline Edit Mode (Cmd+I)
- Streaming Edits
- Rules & Constraints
- Multi-file Support
- AI Chat Memory

**Total Effort:** ~20-27 days

### Should Have (Priority 2) - 5 features
- Command Palette
- Undo/Redo Stack
- Context Panel
- Semantic Search
- AI Autocomplete

**Total Effort:** ~19-27 days

### Nice to Have (Priority 3) - 10 features
- Flows, Batch Ops, Side-by-side Diff, Model Selection, Minimap, etc.

**Total Effort:** ~40-60 days

---

## 🎯 Recommended Implementation Order

### Phase 1: Core UX (2-3 weeks)
1. Inline Edit Mode
2. AI Chat Memory
3. Rules & Constraints
4. Command Palette
5. Undo/Redo Stack

### Phase 2: Multi-file & Streaming (2-3 weeks)
6. Multi-file/Chapter Support
7. Streaming Edits
8. Context Panel

### Phase 3: Advanced AI (2-3 weeks)
9. Semantic Search
10. AI Autocomplete
11. Batch Operations

### Phase 4: Polish & Extras (2-4 weeks)
12. Flows
13. Side-by-side Diff
14. Model Selection
15. External Tools Integration

---

**Total Timeline:** 8-13 weeks for full Windsurf-like experience

**MVP (Phase 1 only):** 2-3 weeks for biggest UX improvements
