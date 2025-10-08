import React, { useState, FC, ReactNode, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Chat, Type, GenerateContentResponse, FunctionDeclaration } from "@google/genai";
import * as ReactWindow from 'react-window';

// --- API & MODEL SETUP ---
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- UTILITIES ---
function debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number,
): (...args: Parameters<T>) => void {
    let timeoutId: number | undefined;

    return function (...args: Parameters<T>) {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
            func(...args);
        }, delay);
    };
}

// --- LOCAL CHECKERS ---
const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

const localStyleCheck = (text: string) => {
    const words = countWords(text);
    if (words === 0) return { pass: true, details: {} };

    // Naive passive voice check (is/was/were + verb ending in -ed)
    const passiveMatches = text.match(/\b(is|are|was|were|be|been|being)\s+([a-zA-Z]+ed)\b/gi) || [];
    // Adverb check (-ly words)
    const adverbMatches = text.match(/\b(\w+ly)\b/gi) || [];
    
    const adverbsPer100 = (adverbMatches.length / words) * 100;
    const passivePer100 = (passiveMatches.length / words) * 100;

    // Rules
    const MAX_ADVERBS_PCT = 4; // 4 per 100 words
    const MAX_PASSIVE_PCT = 3; // 3 per 100 words

    const checks = {
        adverbs: {
            value: adverbsPer100.toFixed(1) + '%',
            pass: adverbsPer100 <= MAX_ADVERBS_PCT,
        },
        passiveVoice: {
            value: passivePer100.toFixed(1) + '%',
            pass: passivePer100 <= MAX_PASSIVE_PCT,
        }
    };

    return {
        pass: checks.adverbs.pass && checks.passiveVoice.pass,
        details: checks
    };
};

const localPovCheck = (text: string, rule: 'first' | 'third' = 'third') => {
    const hasFirstPerson = /\b(I|me|my|mine|we|us|our|ours)\b/i.test(text);
    const hasThirdPerson = /\b(he|him|his|she|her|hers|they|them|theirs)\b/i.test(text);

    if (rule === 'first' && hasThirdPerson) {
        return { pass: false, message: 'Warning: Found third-person pronouns in a first-person POV section.' };
    }
    if (rule === 'third' && hasFirstPerson) {
        return { pass: false, message: 'Warning: Found first-person pronouns in a third-person POV section.' };
    }
    return { pass: true, message: 'POV consistent.' };
};


// --- TYPES ---
type ChatMessageData = {
  id: string;
  sender: 'user' | 'agent';
  name: string;
  avatar: string;
  text: string;
};

type Annotation = {
  id: number;
  category: string;
  reasoning: string;
  confidence: number;
  originalText: string;
  suggestedChange: string;
};

type HistoryEntry = {
    id: number;
    timestamp: Date;
    text: string;
    description: string;
    type: 'initial' | 'manual' | 'ai' | 'suggestion' | 'revert' | 'import';
    version: string;
};

type Metadata = {
  title: string;
  author: string;
  language: string;
  coverUrl: string;
};

type ReadabilityCriterion = {
    criterion: string;
    score: number;
    justification: string;
};

type PerformanceLogEntry = {
    id: number;
    timestamp: Date;
    tool: string;
    duration: number; // in milliseconds
};

type LintResult = {
    anchor: string;
    text: string;
    issues: {
        style?: any;
        pov?: any;
    };
};

// --- BOOK-CASCADE AGENT TYPES ---
type MemoryCharacter = { id: string; names: string[]; voice_profile?: any; state?: any; anchors: string[]; confidence: number; };
type MemoryWorldLocation = { id: string; desc: string; anchors: string[]; confidence: number; };
type MemoryGlossaryItem = { term: string; traits: string[]; anchors: string[]; confidence: number; };
type MemoryTimelineEvent = { t: string; event: string; anchors: string[]; };

type Bible = {
  characters: MemoryCharacter[];
  world: { locations: MemoryWorldLocation[]; };
  glossary: MemoryGlossaryItem[];
  timeline: MemoryTimelineEvent[];
};

type BibleDelta = {
    characters_add_or_update?: MemoryCharacter[];
    world_add_or_update?: { locations: MemoryWorldLocation[] };
    glossary_add_or_update?: MemoryGlossaryItem[];
    timeline_add_or_update?: MemoryTimelineEvent[];
};

type Patch = {
    patch_id: string;
    target: { chapter: number; scene: number; para: number; anchor: string; };
    type: 'replace' | 'insert' | 'delete' | 'move';
    constraints: string[];
    before_excerpt: string;
    after_proposed: string | string[]; // Can now be an array for A/B testing
    rationale: { goal: string; checks: Record<string, string>; };
};

type ManuscriptRules = {
    pov: 'first' | 'third' | 'mixed';
    tense: 'past' | 'present' | 'mixed';
    style: string; // e.g., "Hemingway", "Tolkien", "Modern Literary"
    constraints: string[]; // e.g., "Don't change character names", "Keep timeline consistent"
    vocabulary: {
        forbidden: string[]; // Words to avoid
        preferred: string[]; // Words to prefer
    };
    characters: {
        name: string;
        aliases: string[];
        notes: string;
    }[];
    customInstructions: string; // Free-form instructions for AI
};

type UndoAction = {
    type: 'text_change' | 'patch_apply' | 'annotation_accept' | 'inline_edit';
    before: string;
    after: string;
    timestamp: Date;
    description: string;
};

type AIContext = {
    includeRules: boolean;
    includeBible: boolean;
    selectedCharacters: string[]; // character IDs
    selectedLocations: string[]; // location IDs
    customNotes: string;
};

type SearchResult = {
    paragraphIndex: number;
    text: string;
    relevanceScore: number;
    context: string; // surrounding text
};


const INITIAL_TEXT = `Chapter 1

It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him.

The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured poster, too large for indoor display, had been tacked to the wall. It depicted simply an enormous face, more than a metre wide: the face of a man of about forty-five, with a heavy black moustache and ruggedly handsome features. Winston made for the stairs. It was no use trying the lift. Even at the best of times it was seldom working, and at present the electric current was cut off during daylight hours. It was part of the economy drive in preparation for Hate Week. The flat was seven flights up, and Winston, who was thirty-nine and had a varicose ulcer above his right ankle, went slowly, resting several times on the way. On each landing, opposite the lift-shaft, the poster with the enormous face gazed from the wall. It was one of those pictures which are so contrived that the eyes follow you about when you move. BIG BROTHER IS WATCHING YOU, the caption beneath it ran.`;

// --- SVG ICONS ---

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
);

// --- ATOMIC COMPONENTS ---

type ButtonProps = {
  variant?: 'neutral' | 'primary' | 'success' | 'danger';
  children?: ReactNode;
  className?: string;
  [key: string]: any;
};

const Button = ({ variant = 'neutral', children, className, ...props }: ButtonProps) => (
  <button className={`btn btn-${variant} ${className || ''}`.trim()} {...props}>{children}</button>
);

type TagProps = {
    children?: ReactNode;
    color?: string;
};

const Tag = ({ children, color }: TagProps) => (
  <span className={`tag ${color ? 'tag-' + color : ''}`}>{children}</span>
);

const ProgressBar = ({ value, className = '' }: { value: number; className?: string; }) => (
  <div className={`progress-bar ${className}`} title={`${value}%`}>
    <div className="progress-bar-inner" style={{ width: `${value}%` }}></div>
  </div>
);

// Fix: Update CardProps to accept a 'key' prop and other props, and update the Card component to spread these extra props to the underlying div. This fixes a TypeScript error when using Card inside a map function and improves component flexibility.
type CardProps = {
    children?: ReactNode;
    className?: string;
    [key: string]: any;
};

const Card = ({ children, className = '', ...props }: CardProps) => (
    <div className={`card ${className}`} {...props}>{children}</div>
);

// --- COMPONENT BLOCKS ---

const ChatMessage: FC<{ msg: ChatMessageData }> = ({ msg }) => {
    const { text } = msg;
    
    // Guard against undefined text
    if (!text) {
        return (
            <div className={`chat-message ${msg.sender}`}>
                <div className="message-content"></div>
            </div>
        );
    }
    
    const jsonStart = text.indexOf('{\n');
    const jsonEnd = text.lastIndexOf('\n}');
    let summary = text;
    let jsonContent: string | null = null;

    if (jsonStart !== -1 && jsonEnd > jsonStart) {
        summary = text.substring(0, jsonStart).trim();
        const jsonString = text.substring(jsonStart, jsonEnd + 2);
        try {
            const parsed = JSON.parse(jsonString);
            jsonContent = JSON.stringify(parsed, null, 2);
        } catch (e) {
            // Not valid JSON, so we'll just display the full text
            summary = text;
            jsonContent = null;
        }
    }
    
    return (
        <div className={`chat-message ${msg.sender}`}>
            <div className="chat-message-content">
                <div className="chat-message-name">{msg.name}</div>
                {summary && <p>{summary}</p>}
                {jsonContent && (
                    <div className="chat-message-json">
                        <pre><code>{jsonContent}</code></pre>
                    </div>
                )}
            </div>
        </div>
    );
};

type ChatComposerProps = {
    onSendMessage: (message: string) => void;
    isLoading: boolean;
};

const ChatComposer: FC<ChatComposerProps> = ({ onSendMessage, isLoading }) => {
    const [message, setMessage] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim() && !isLoading) {
            onSendMessage(message);
            setMessage('');
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            handleSubmit(e);
        }
    };

    return (
        <form className="chat-composer" onSubmit={handleSubmit}>
            <input
                className="input"
                type="text"
                placeholder={isLoading ? "Thinking..." : "Describe the edit you want..."}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
            />
            <Button variant="primary" className="btn-icon" aria-label="Send" type="submit" disabled={isLoading || !message.trim()}>
                {isLoading ? '...' : <SendIcon />}
            </Button>
        </form>
    );
};

const QuickPhrases: FC<{ onSelectPhrase: (phrase: string) => void; isLoading: boolean; onClearHistory?: () => void; }> = ({ onSelectPhrase, isLoading, onClearHistory }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    const phases = [
        {
            name: "Foundation",
            phrases: [
                "Build Story Bible",
                "Update timeline consistency",
                "Track character development"
            ]
        },
        {
            name: "Structure Analysis",
            phrases: [
                "Analyze the main character's arc",
                "Identify plot holes",
                "Check for continuity errors"
            ]
        },
        {
            name: "Story Flow",
            phrases: [
                "Evaluate pacing and tension",
                "Strengthen opening hook",
                "Improve scene transitions"
            ]
        },
        {
            name: "Scene Polish",
            phrases: [
                "Review dialogue authenticity",
                "Add sensory details",
                "Enhance character voice"
            ]
        },
        {
            name: "Line Editing",
            phrases: [
                "Tighten the prose in the first chapter",
                "Find and fix passive voice",
                "Remove redundant adverbs"
            ]
        }
    ];
    
    const handlePhraseClick = (phrase: string) => {
        onSelectPhrase(phrase);
        setIsOpen(false);
    };
    
    return (
        <div className="quick-phrases-container">
            <div className="quick-phrases-header">
                <Button 
                    variant="neutral" 
                    onClick={() => setIsOpen(!isOpen)} 
                    disabled={isLoading}
                    className="quick-phrases-toggle"
                >
                    Quick Commands ▼
                </Button>
                {onClearHistory && (
                    <Button 
                        variant="danger" 
                        onClick={onClearHistory} 
                        disabled={isLoading}
                        className="clear-chat-btn-inline"
                    >
                        Clear Chat
                    </Button>
                )}
            </div>
            {isOpen && (
                <>
                    <div className="quick-phrases-overlay" onClick={() => setIsOpen(false)} />
                    <div className="quick-phrases-popup">
                        {phases.map((phase) => (
                            <div key={phase.name} className="phrase-phase-vertical">
                                <div className="phase-label-vertical">{phase.name}</div>
                                <div className="phase-buttons-vertical">
                                    {phase.phrases.map(phrase => (
                                        <Button 
                                            key={phrase} 
                                            variant="primary" 
                                            onClick={() => handlePhraseClick(phrase)} 
                                            disabled={isLoading}
                                        >
                                            {phrase}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

type AnnotationCardProps = {
    annotation: Annotation;
    onAccept: (annotation: Annotation) => void;
    onReject: (id: number) => void;
};

const AnnotationCard: FC<AnnotationCardProps> = ({ annotation, onAccept, onReject }) => (
    <Card className="annotation-card">
        <div className="card-header">
            <h4 className="card-title">{annotation.category}</h4>
            <Tag color="success">{`Confidence: ${annotation.confidence}%`}</Tag>
        </div>
        <div className="annotation-card-diff">
            <del>{annotation.originalText}</del>
            <ins>{annotation.suggestedChange}</ins>
        </div>
        <p className="annotation-card-reasoning">{annotation.reasoning}</p>
        <div className="annotation-card-footer">
            <Button variant="danger" className="btn-sm" onClick={() => onReject(annotation.id)}>Reject</Button>
            <Button variant="success" className="btn-sm" onClick={() => onAccept(annotation)}>Accept</Button>
        </div>
    </Card>
);

type EditRangeSelectorProps = {
    currentRange: string;
    onChangeRange: (range: string) => void;
};
const EditRangeSelector: FC<EditRangeSelectorProps> = ({ currentRange, onChangeRange }) => {
    const ranges = ['Selection', 'Scene', 'Chapter', 'Book'];
    return (
        <div className="edit-range-selector" style={{ gap: '20px' }}>
            <span className="edit-range-label">Range:</span>
            {ranges.map(range => (
                <Button 
                    key={range} 
                    variant={currentRange === range.toLowerCase() ? 'primary' : 'neutral'}
                    className="btn-sm"
                    onClick={() => onChangeRange(range.toLowerCase())}
                >
                    {range}
                </Button>
            ))}
        </div>
    );
};

type EditorToolbarProps = {
    wordCount: number;
    characterCount: number;
    editRange: string;
    onEditRangeChange: (range: string) => void;
    fontSize: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
};

const EditorToolbar: FC<EditorToolbarProps> = ({ wordCount, characterCount, editRange, onEditRangeChange, fontSize, onZoomIn, onZoomOut }) => {
    const ranges = ['selection', 'scene', 'chapter', 'book'];
    
    return (
        <div className="editor-toolbar">
            <div className="editor-stats">
                <span className="stat-item">Words: {wordCount.toLocaleString()}</span>
                <span className="stat-item">Characters: {characterCount.toLocaleString()}</span>
                <div className="zoom-controls">
                    <button className="zoom-btn" onClick={onZoomOut} title="Decrease font size">−</button>
                    <button className="zoom-btn" onClick={onZoomIn} title="Increase font size">+</button>
                </div>
            </div>
            <div className="editor-actions">
                <div className="range-selector-buttons">
                    {ranges.map(range => (
                        <Button
                            key={range}
                            variant={editRange === range ? 'primary' : 'neutral'}
                            className="btn-sm"
                            onClick={() => onEditRangeChange(range)}
                        >
                            {range.charAt(0).toUpperCase() + range.slice(1)}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    );
};

type EditableTextAreaProps = {
    text: string;
    onTextChange: (text: string) => void;
    annotations: Annotation[];
    highlightedParaIndex: number | null;
    highlightedText?: string;
    onSelectionChange?: (selection: { start: number; end: number; text: string }) => void;
    fontSize: number;
};

type EditorHandle = {
    scrollToLine: (line: number) => void;
    getSelection: () => { start: number; end: number; text: string } | null;
};

const EditableTextArea = forwardRef<EditorHandle, EditableTextAreaProps>(({ text, onTextChange, annotations, highlightedParaIndex, highlightedText, onSelectionChange, fontSize }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<ReactWindow.FixedSizeList>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useImperativeHandle(ref, () => ({
        scrollToLine: (line: number) => {
            listRef.current?.scrollToItem(line, 'start');
        },
        getSelection: () => {
            if (!textareaRef.current) return null;
            const start = textareaRef.current.selectionStart;
            const end = textareaRef.current.selectionEnd;
            if (start === end) return null;
            return {
                start,
                end,
                text: text.substring(start, end)
            };
        }
    }));

    useEffect(() => {
        if (!backdropRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        resizeObserver.observe(backdropRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const lines = useMemo(() => text.split('\n'), [text]);
    const LINE_HEIGHT = 28.16;
    
    const { paragraphStartLines, paragraphLineCounts } = useMemo(() => {
        const paras = text.split(/\n\s*\n/);
        const startLines: number[] = [];
        const lineCounts: number[] = [];
        let currentLine = 0;
        for (const p of paras) {
            startLines.push(currentLine);
            const numLines = p.split('\n').length;
            lineCounts.push(numLines);
            currentLine += numLines + (p.length > 0 ? 1 : 0);
        }
        return { paragraphStartLines: startLines, paragraphLineCounts: lineCounts };
    }, [text]);

    const annotationRegex = useMemo(() => {
        const escapeRegExp = (string: string): string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const highlightTexts = annotations.map(a => a.originalText.split('\n')[0]).filter(Boolean);
        if (highlightTexts.length === 0) return null;
        const uniqueHighlights = [...new Set(highlightTexts)];
        return new RegExp(`(${uniqueHighlights.map(escapeRegExp).join('|')})`, 'g');
    }, [annotations]);
    
    const Row = ({ index, style }: { index: number, style: React.CSSProperties }) => {
        const line = lines[index];
        let highlightedHTML = line;
        
        // Apply annotation highlights
        if (annotationRegex) {
            highlightedHTML = highlightedHTML.replace(annotationRegex, '<mark>$1</mark>');
        }
        
        if (!highlightedHTML) {
            highlightedHTML = '&nbsp;';
        }
        
        return (
            <div style={style}>
                <span dangerouslySetInnerHTML={{ __html: highlightedHTML }} />
            </div>
        );
    };

    const handleScroll = () => {
        if (textareaRef.current && backdropRef.current) {
            const { scrollTop, scrollLeft } = textareaRef.current;
            backdropRef.current.scrollLeft = scrollLeft;
            listRef.current?.scrollTo(scrollTop);
        }
    };
    
    return (
        <div className="editable-textarea-wrapper">
            <div ref={backdropRef} className="editable-textarea-backdrop">
                <ReactWindow.FixedSizeList
                    ref={listRef}
                    height={size.height}
                    width={size.width}
                    itemCount={lines.length}
                    itemSize={LINE_HEIGHT}
                    className="editable-textarea-highlights"
                    style={{ overflow: 'hidden' }}
                >
                    {Row}
                </ReactWindow.FixedSizeList>
            </div>
            <textarea
                ref={textareaRef}
                className="editable-textarea"
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                onScroll={handleScroll}
                onSelect={(e) => {
                    if (onSelectionChange && textareaRef.current) {
                        const start = textareaRef.current.selectionStart;
                        const end = textareaRef.current.selectionEnd;
                        if (start !== end) {
                            onSelectionChange({
                                start,
                                end,
                                text: text.substring(start, end)
                            });
                        }
                    }
                }}
                style={{ fontSize: `${fontSize}px` }}
                aria-label="Manuscript Editor"
                spellCheck="false"
            />
        </div>
    );
});

type InlineEditPopupProps = {
    visible: boolean;
    selectedText: string;
    onSubmit: (instruction: string) => void;
    onClose: () => void;
    isLoading: boolean;
};

const InlineEditPopup: FC<InlineEditPopupProps> = ({ visible, selectedText, onSubmit, onClose, isLoading }) => {
    const [instruction, setInstruction] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (visible && inputRef.current) {
            inputRef.current.focus();
        }
    }, [visible]);

    useEffect(() => {
        if (!visible) {
            setInstruction('');
        }
    }, [visible]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (instruction.trim() && !isLoading) {
            onSubmit(instruction);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!visible) return null;

    return (
        <div className="inline-edit-overlay" onClick={onClose}>
            <div className="inline-edit-popup" onClick={(e) => e.stopPropagation()}>
                <div className="inline-edit-header">
                    <span className="inline-edit-title">✨ Quick Edit</span>
                    <button className="inline-edit-close" onClick={onClose} aria-label="Close">×</button>
                </div>
                <div className="inline-edit-selected">
                    <strong>Selected:</strong> "{selectedText.substring(0, 100)}{selectedText.length > 100 ? '...' : ''}"
                </div>
                <form onSubmit={handleSubmit} className="inline-edit-form">
                    <input
                        ref={inputRef}
                        type="text"
                        className="inline-edit-input"
                        placeholder="What would you like to change? (e.g., 'remove passive voice', 'make it shorter')"
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                    />
                    <div className="inline-edit-actions">
                        <Button variant="neutral" type="button" onClick={onClose} disabled={isLoading}>
                            Cancel (Esc)
                        </Button>
                        <Button variant="primary" type="submit" disabled={isLoading || !instruction.trim()}>
                            {isLoading ? 'Applying...' : 'Apply (Enter)'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

type Command = {
    id: string;
    label: string;
    description?: string;
    shortcut?: string;
    category: string;
    action: () => void;
};

type CommandPaletteProps = {
    visible: boolean;
    onClose: () => void;
    commands: Command[];
};

const CommandPalette: FC<CommandPaletteProps> = ({ visible, onClose, commands }) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (visible && inputRef.current) {
            inputRef.current.focus();
        }
    }, [visible]);

    useEffect(() => {
        if (!visible) {
            setQuery('');
            setSelectedIndex(0);
        }
    }, [visible]);

    // Simple fuzzy search
    const filteredCommands = useMemo(() => {
        if (!query.trim()) return commands;
        
        const lowerQuery = query.toLowerCase();
        return commands.filter(cmd => {
            const searchText = `${cmd.label} ${cmd.description || ''} ${cmd.category}`.toLowerCase();
            // Simple substring match (can be enhanced with proper fuzzy search library)
            return searchText.includes(lowerQuery);
        }).sort((a, b) => {
            // Prioritize label matches over description matches
            const aLabelMatch = a.label.toLowerCase().includes(lowerQuery);
            const bLabelMatch = b.label.toLowerCase().includes(lowerQuery);
            if (aLabelMatch && !bLabelMatch) return -1;
            if (!aLabelMatch && bLabelMatch) return 1;
            return 0;
        });
    }, [query, commands]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredCommands[selectedIndex]) {
                filteredCommands[selectedIndex].action();
                onClose();
            }
        }
    };

    const handleCommandClick = (cmd: Command) => {
        cmd.action();
        onClose();
    };

    if (!visible) return null;

    return (
        <div className="command-palette-overlay" onClick={onClose}>
            <div className="command-palette" onClick={(e) => e.stopPropagation()}>
                <div className="command-palette-input-wrapper">
                    <span className="command-palette-icon">🔍</span>
                    <input
                        ref={inputRef}
                        type="text"
                        className="command-palette-input"
                        placeholder="Type a command or search..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <span className="command-palette-hint">Esc to close</span>
                </div>
                <div className="command-palette-results">
                    {filteredCommands.length === 0 ? (
                        <div className="command-palette-empty">No commands found</div>
                    ) : (
                        filteredCommands.map((cmd, index) => (
                            <button
                                key={cmd.id}
                                className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                                onClick={() => handleCommandClick(cmd)}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                <div className="command-palette-item-main">
                                    <div className="command-palette-item-label">{cmd.label}</div>
                                    {cmd.description && (
                                        <div className="command-palette-item-description">{cmd.description}</div>
                                    )}
                                </div>
                                <div className="command-palette-item-meta">
                                    <span className="command-palette-item-category">{cmd.category}</span>
                                    {cmd.shortcut && (
                                        <kbd className="command-palette-kbd">{cmd.shortcut}</kbd>
                                    )}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

type ContextPanelProps = {
    context: AIContext;
    bible: Bible;
    rules: ManuscriptRules;
    onUpdateContext: (context: AIContext) => void;
};

const ContextPanel: FC<ContextPanelProps> = ({ context, bible, rules, onUpdateContext }) => {
    const [localContext, setLocalContext] = useState<AIContext>(context);

    useEffect(() => {
        setLocalContext(context);
    }, [context]);

    const handleToggle = (field: 'includeRules' | 'includeBible') => {
        const updated = { ...localContext, [field]: !localContext[field] };
        setLocalContext(updated);
        onUpdateContext(updated);
    };

    const handleToggleCharacter = (characterId: string) => {
        const updated = {
            ...localContext,
            selectedCharacters: localContext.selectedCharacters.includes(characterId)
                ? localContext.selectedCharacters.filter(id => id !== characterId)
                : [...localContext.selectedCharacters, characterId]
        };
        setLocalContext(updated);
        onUpdateContext(updated);
    };

    const handleToggleLocation = (locationId: string) => {
        const updated = {
            ...localContext,
            selectedLocations: localContext.selectedLocations.includes(locationId)
                ? localContext.selectedLocations.filter(id => id !== locationId)
                : [...localContext.selectedLocations, locationId]
        };
        setLocalContext(updated);
        onUpdateContext(updated);
    };

    const handleNotesChange = (notes: string) => {
        const updated = { ...localContext, customNotes: notes };
        setLocalContext(updated);
        onUpdateContext(updated);
    };

    // Simple token estimation (rough: 1 token ≈ 4 characters)
    const estimateTokens = () => {
        let total = 0;
        if (localContext.includeRules) {
            const rulesText = JSON.stringify(rules);
            total += Math.ceil(rulesText.length / 4);
        }
        if (localContext.includeBible) {
            const bibleText = JSON.stringify(bible);
            total += Math.ceil(bibleText.length / 4);
        }
        if (localContext.customNotes) {
            total += Math.ceil(localContext.customNotes.length / 4);
        }
        return total;
    };

    const tokens = estimateTokens();

    return (
        <div>
            <div className="context-summary">
                <div className="context-summary-item">
                    <span className="context-summary-label">Estimated Tokens:</span>
                    <span className="context-summary-value">{tokens.toLocaleString()}</span>
                </div>
            </div>

            <div className="form-group">
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={localContext.includeRules}
                        onChange={() => handleToggle('includeRules')}
                    />
                    <span>Include Manuscript Rules</span>
                </label>
                <p className="form-hint">POV, tense, style, constraints, vocabulary</p>
            </div>

            <div className="form-group">
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={localContext.includeBible}
                        onChange={() => handleToggle('includeBible')}
                    />
                    <span>Include Full Story Bible</span>
                </label>
                <p className="form-hint">All characters, locations, glossary, timeline</p>
            </div>

            {bible.characters.length > 0 && (
                <div className="form-group">
                    <label className="form-label">Select Specific Characters</label>
                    <div className="checkbox-list">
                        {bible.characters.map(char => (
                            <label key={char.id} className="checkbox-label-sm">
                                <input
                                    type="checkbox"
                                    checked={localContext.selectedCharacters.includes(char.id)}
                                    onChange={() => handleToggleCharacter(char.id)}
                                />
                                <span>{char.names[0]}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {bible.world.locations.length > 0 && (
                <div className="form-group">
                    <label className="form-label">Select Specific Locations</label>
                    <div className="checkbox-list">
                        {bible.world.locations.map(loc => (
                            <label key={loc.id} className="checkbox-label-sm">
                                <input
                                    type="checkbox"
                                    checked={localContext.selectedLocations.includes(loc.id)}
                                    onChange={() => handleToggleLocation(loc.id)}
                                />
                                <span>{loc.id}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            <div className="form-group">
                <label className="form-label">Custom Notes for AI</label>
                <textarea
                    className="input"
                    placeholder="Add any additional context or instructions for the AI..."
                    value={localContext.customNotes}
                    onChange={(e) => handleNotesChange(e.target.value)}
                    rows={4}
                />
                <p className="form-hint">This will be included in every AI request</p>
            </div>
        </div>
    );
};

type SearchPanelProps = {
    manuscriptText: string;
    onNavigateToResult: (paragraphIndex: number) => void;
};

const SearchPanel: FC<SearchPanelProps> = ({ manuscriptText, onNavigateToResult }) => {
    const [query, setQuery] = useState('');
    const [searchType, setSearchType] = useState<'exact' | 'semantic'>('semantic');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const paragraphs = useMemo(() => manuscriptText.split(/\n\s*\n/), [manuscriptText]);

    const performExactSearch = (searchQuery: string): SearchResult[] => {
        const lowerQuery = searchQuery.toLowerCase();
        const found: SearchResult[] = [];

        paragraphs.forEach((para, index) => {
            if (para.toLowerCase().includes(lowerQuery)) {
                const contextStart = Math.max(0, para.toLowerCase().indexOf(lowerQuery) - 50);
                const contextEnd = Math.min(para.length, para.toLowerCase().indexOf(lowerQuery) + searchQuery.length + 50);
                
                found.push({
                    paragraphIndex: index,
                    text: para,
                    relevanceScore: 1.0,
                    context: '...' + para.substring(contextStart, contextEnd) + '...'
                });
            }
        });

        return found;
    };

    const performSemanticSearch = async (searchQuery: string): Promise<SearchResult[]> => {
        try {
            // Use Gemini to find semantically similar paragraphs
            const prompt = `Given the search query: "${searchQuery}"

Analyze the following paragraphs and return the indices of paragraphs that are semantically relevant to the query, ranked by relevance (0-1 score).

Paragraphs:
${paragraphs.map((p, i) => `[${i}] ${p.substring(0, 200)}...`).join('\n\n')}

Return ONLY a JSON array of objects with: {"index": number, "score": number, "reason": string}
Return top 10 most relevant results, sorted by score descending.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    temperature: 0.2,
                    responseMimeType: 'application/json',
                }
            });

            const semanticResults = JSON.parse(response.text) as Array<{ index: number; score: number; reason: string }>;
            
            return semanticResults.map(result => ({
                paragraphIndex: result.index,
                text: paragraphs[result.index],
                relevanceScore: result.score,
                context: paragraphs[result.index].substring(0, 150) + '...'
            }));
        } catch (error) {
            console.error('Semantic search error:', error);
            // Fallback to exact search
            return performExactSearch(searchQuery);
        }
    };

    const handleSearch = async () => {
        if (!query.trim()) return;

        setIsSearching(true);
        setResults([]);

        try {
            const searchResults = searchType === 'exact' 
                ? performExactSearch(query)
                : await performSemanticSearch(query);
            
            setResults(searchResults);
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isSearching) {
            handleSearch();
        }
    };

    return (
        <div className="search-panel">
            <div className="search-input-group">
                <input
                    type="text"
                    className="input search-input"
                    placeholder="Search your manuscript..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSearching}
                />
                <Button 
                    variant="primary" 
                    onClick={handleSearch}
                    disabled={isSearching || !query.trim()}
                >
                    {isSearching ? 'Searching...' : 'Search'}
                </Button>
            </div>

            <div className="search-type-toggle">
                <label className="checkbox-label-sm">
                    <input
                        type="checkbox"
                        checked={searchType === 'exact'}
                        onChange={() => setSearchType('exact')}
                    />
                    <span>Exact Match</span>
                </label>
                <label className="checkbox-label-sm">
                    <input
                        type="checkbox"
                        checked={searchType === 'semantic'}
                        onChange={() => setSearchType('semantic')}
                    />
                    <span>Semantic (AI)</span>
                </label>
            </div>

            {results.length > 0 && (
                <div className="search-results">
                    <div className="search-results-header">
                        Found {results.length} result{results.length !== 1 ? 's' : ''}
                    </div>
                    {results.map((result, index) => (
                        <div 
                            key={index} 
                            className="search-result-item"
                            onClick={() => onNavigateToResult(result.paragraphIndex)}
                        >
                            <div className="search-result-header">
                                <span className="search-result-index">Paragraph {result.paragraphIndex + 1}</span>
                                {searchType === 'semantic' && (
                                    <span className="search-result-score">
                                        {Math.round(result.relevanceScore * 100)}% relevant
                                    </span>
                                )}
                            </div>
                            <div className="search-result-context">{result.context}</div>
                        </div>
                    ))}
                </div>
            )}

            {!isSearching && query && results.length === 0 && (
                <div className="search-no-results">
                    No results found for "{query}"
                </div>
            )}
        </div>
    );
};

const MetadataForm: FC<{ initialData: Metadata; onSave: (data: Metadata) => void; }> = ({ initialData, onSave }) => {
    const [formData, setFormData] = useState<Metadata>(initialData);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        setFormData(initialData);
    }, [initialData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
        if (isSaved) setIsSaved(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2500);
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="form-group">
                <label className="form-label" htmlFor="title">Title</label>
                <input className="input" type="text" id="title" value={formData.title} onChange={handleChange} />
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor="author">Author</label>
                <input className="input" type="text" id="author" value={formData.author} onChange={handleChange} />
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor="language">Language</label>
                <input className="input" type="text" id="language" value={formData.language} onChange={handleChange} />
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor="coverUrl">Cover URL</label>
                <input className="input" type="url" id="coverUrl" placeholder="https://example.com/cover.jpg" value={formData.coverUrl} onChange={handleChange} />
            </div>
            <Button variant="primary" type="submit" disabled={isSaved}>
                {isSaved ? 'Saved!' : 'Save Metadata'}
            </Button>
        </form>
    );
};

const MetricsPanel: FC<{ text: string; performanceLog: PerformanceLogEntry[] }> = ({ text, performanceLog }) => {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const charCount = text.length;

    const [isLoading, setIsLoading] = useState(false);
    const [readabilityScore, setReadabilityScore] = useState<number | string>('?');
    const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);
    const [analysisCriteria, setAnalysisCriteria] = useState<ReadabilityCriterion[]>([]);
    const [coherenceScore, setCoherenceScore] = useState<number | string>('?');
    const [coherenceSummary, setCoherenceSummary] = useState<string | null>(null);
    const [coherenceCriteria, setCoherenceCriteria] = useState<ReadabilityCriterion[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleUpdateMetrics = async () => {
        setIsLoading(true);
        setError(null);
        
        setAnalysisSummary(null);
        setAnalysisCriteria([]);
        setReadabilityScore('...');
        setCoherenceSummary(null);
        setCoherenceCriteria([]);
        setCoherenceScore('...');

        const readabilityPrompt = `Evaluate the provided literary text using the rubric below. Your response must be a JSON object that strictly adheres to the provided schema. First, read the text without consulting external sources. Then briefly (2–3 sentences) summarize the main plot and characters. For each criterion, assign a score from 0 to 10 with a 1–2 sentence justification based on the descriptors. Calculate the final score as the weighted sum of (criterion_score × weight), rounded to one decimal place.

Rubric with weights:
- Plot coherence (weight: 0.3): 0–2: incoherent chapters, no orientation; 3–5: partial orientation, plot gaps; 6–8: mostly coherent with minor mismatches; 9–10: clear orientation, logical sequence, integrated theme.
- Character depth (weight: 0.2): 0–2: flat, unmotivated; 3–5: partial traits, weak motivation; 6–8: well-developed but with some inaccuracies; 9–10: multidimensional, well-motivated, with development.
- Narrative structure & pacing (weight: 0.15): 0–2: chaotic structure; 3–5: basic elements present, weak pacing; 6–8: consistent structure, generally sustained pacing; 9–10: clear setup, rising tension, climax, and resolution.
- Author’s voice & style (weight: 0.15): 0–2: dull, indistinct; 3–5: voice appears sporadically; 6–8: recognizable voice with minor fluctuations; 9–10: vivid, cohesive voice appropriate to genre.
- Language mastery (weight: 0.1): 0–2: many errors, primitive vocabulary; 3–5: occasional errors, limited vocabulary; 6–8: rich lexicon, varied sentences, rare errors; 9–10: flawless language, precise word choice.
- Originality & engagement (weight: 0.1): 0–2: clichéd, emotionally flat; 3–5: some original elements; 6–8: engaging overall with a few fresh moves; 9–10: highly original and immersive.

The final JSON must contain the summary, an array of analysis objects for each criterion, and the final calculated score.`;

        const coherencePrompt = `Evaluate the provided literary text using the rubric below. Your response must be a JSON object that strictly adheres to the provided schema.

Task:
1. Read the text without consulting external sources.
2. Briefly (2–3 sentences) summarize the main plot and characters.
3. For each criterion, assign a score from 0 to 10 with a 1–2 sentence justification based on the descriptors.
4. Calculate the final score as the weighted sum of (criterion_score × weight), rounded to one decimal place.

Rubric (weights and descriptors):
- Plot coherence (across scenes, chapters, and book) (weight: 0.3): 0–2: incoherent, disjointed; 3–5: partially coherent with gaps; 6–8: mostly coherent, minor mismatches; 9–10: fully logical across scenes, chapters, and whole book.
- Character depth (weight: 0.2): 0–2: flat, unmotivated; 3–5: partial traits, weak motivation; 6–8: well-developed but with gaps; 9–10: multidimensional, consistent development.
- Narrative structure & pacing (weight: 0.15): 0–2: chaotic; 3–5: weak, uneven pacing; 6–8: mostly consistent, clear arc; 9–10: strong progression with setup, tension, climax, and resolution.
- Author’s voice & style (weight: 0.15): 0–2: indistinct; 3–5: sporadic; 6–8: recognizable, minor breaks; 9–10: vivid, cohesive, genre-appropriate.
- Language mastery (weight: 0.1): 0–2: many errors, weak vocabulary; 3–5: limited, some mistakes; 6–8: strong language, rare slips; 9–10: flawless, precise, stylistically polished.
- Originality & engagement (weight: 0.1): 0–2: clichéd, dull; 3–5: some originality; 6–8: generally engaging, some novelty; 9–10: highly original, immersive, emotionally impactful.

The final JSON must contain the summary, an array of analysis objects for each criterion, and the final calculated score.`;

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                summary: { type: Type.STRING },
                analysis: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            criterion: { type: Type.STRING },
                            score: { type: Type.NUMBER },
                            justification: { type: Type.STRING }
                        },
                        required: ["criterion", "score", "justification"]
                    }
                },
                finalScore: { type: Type.NUMBER }
            },
            required: ["summary", "analysis", "finalScore"]
        };

        try {
            const textToAnalyze = `\n\nText to analyze:\n"""\n${text}\n"""`;
            const [readabilityResult, coherenceResult] = await Promise.all([
                ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: readabilityPrompt + textToAnalyze,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                    },
                }),
                ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: coherencePrompt + textToAnalyze,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                    },
                })
            ]);
            
            const readabilityData = JSON.parse(readabilityResult.text);
            setReadabilityScore(readabilityData.finalScore.toFixed(1));
            setAnalysisSummary(readabilityData.summary);
            setAnalysisCriteria(readabilityData.analysis);

            const coherenceData = JSON.parse(coherenceResult.text);
            setCoherenceScore(coherenceData.finalScore.toFixed(1));
            setCoherenceSummary(coherenceData.summary);
            setCoherenceCriteria(coherenceData.analysis);

        } catch (e) {
            console.error("Failed to get metrics:", e);
            setError("Failed to analyze the text. The model may have returned an invalid response or an error occurred.");
            setReadabilityScore('?');
            setCoherenceScore('?');
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div>
            {error && <div className="error-banner" style={{marginBottom: 'var(--space-3)'}}>{error}</div>}
            <div className="metrics-grid">
                <div className="metric-item">
                    <div className="metric-value">{wordCount}</div>
                    <div className="metric-label">Words</div>
                </div>
                 <div className="metric-item">
                    <div className="metric-value">{charCount}</div>
                    <div className="metric-label">Characters</div>
                </div>
                <div className="metric-item">
                    <div className="metric-value">{readabilityScore}</div>
                    <div className="metric-label">Readability</div>
                </div>
                <div className="metric-item">
                    <div className="metric-value">{coherenceScore}</div>
                    <div className="metric-label">Coherence</div>
                </div>
            </div>
            <div className="metrics-panel-footer">
                <Button variant="primary" onClick={handleUpdateMetrics} disabled={isLoading}>
                    {isLoading ? 'Analyzing...' : 'Update Metrics'}
                </Button>
            </div>
            {analysisSummary && (
                <div className="readability-report">
                    <h4 className="readability-report-title">Readability Report</h4>
                    <p>{analysisSummary}</p>
                    <table className="readability-table">
                        <thead>
                            <tr>
                                <th>Criterion</th>
                                <th>Score (0–10)</th>
                                <th>Justification</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analysisCriteria.map(item => (
                                <tr key={item.criterion}>
                                    <td>{item.criterion}</td>
                                    <td>{item.score}</td>
                                    <td>{item.justification}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {coherenceSummary && (
                <div className="readability-report">
                    <h4 className="readability-report-title">Coherence Report</h4>
                    <p>{coherenceSummary}</p>
                    <table className="readability-table">
                        <thead>
                            <tr>
                                <th>Criterion</th>
                                <th>Score (0–10)</th>
                                <th>Justification</th>
                            </tr>
                        </thead>
                        <tbody>
                            {coherenceCriteria.map(item => (
                                <tr key={item.criterion}>
                                    <td>{item.criterion}</td>
                                    <td>{item.score}</td>
                                    <td>{item.justification}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            {/* Performance Log Section */}
            {performanceLog.length > 0 && (
                <div style={{marginTop: 'var(--space-5)'}}>
                    <h4 className="section-title">Agent Performance Log</h4>
                    <div className="performance-summary">
                        <span>Total Calls: {performanceLog.length}</span>
                        <span>Avg Duration: {(performanceLog.reduce((acc, e) => acc + e.duration, 0) / performanceLog.length / 1000).toFixed(2)}s</span>
                    </div>
                    <div className="history-list">
                        {[...performanceLog].reverse().slice(0, 10).map((entry, idx) => (
                            <div key={idx} className="history-item">
                                <div className="history-item-main">
                                    <span className="history-item-icon">⚡</span>
                                    <div className="history-item-details">
                                        <p className="history-item-description">{entry.tool}</p>
                                        <div className="history-item-meta">
                                            <Tag>{(entry.duration / 1000).toFixed(2)}s</Tag>
                                            <span className="history-item-time">
                                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const ImportPanel: FC<{ onTextImport: (text: string) => void }> = ({ onTextImport }) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUrlImport = async () => {
        if (!url) {
            setError("Please enter a URL.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            setLoadingMessage('Fetching content...');
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const htmlContent = await response.text();
            
            setLoadingMessage('Extracting article...');

            const extractionPrompt = `You are an expert web scraper. Your task is to extract the main article text from the provided HTML content. Remove all HTML tags, navigation menus, sidebars, advertisements, and footers. Return only the clean, plain text of the article.

HTML CONTENT:
"""
${htmlContent}
"""`;

            const extractionResult = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: extractionPrompt,
            });

            const extractedText = extractionResult.text;

            if (!extractedText || extractedText.trim().length < 50) {
                 throw new Error("Could not extract significant text. The page might not be an article.");
            }

            onTextImport(extractedText);
            setUrl('');

        } catch (e: any) {
            setError(`Import failed. This could be a network issue, CORS security restriction, or an issue extracting content. Error: ${e.message}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setError(null);
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                onTextImport(text);
                if (fileInputRef.current) fileInputRef.current.value = "";
            };
            reader.onerror = () => {
                setError("Failed to read the file.");
            };
            reader.readAsText(file);
        }
    };

    const handleChooseFileClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div>
            {error && <div className="error-banner" style={{marginBottom: 'var(--space-3)', backgroundColor: '#ffebee', color: '#c62828', border: 'none', padding: 'var(--space-2)'}}>{error}</div>}
            <div className="form-group">
                <label className="form-label" htmlFor="import-url">Import text from URL</label>
                <input 
                    className="input" 
                    type="url" 
                    id="import-url" 
                    placeholder="https://example.com/article"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isLoading}
                />
                <Button 
                    variant="primary" 
                    onClick={handleUrlImport}
                    disabled={isLoading || !url}
                    style={{marginTop: '8px'}}
                >
                    {isLoading ? loadingMessage : 'Import text from URL'}
                </Button>
            </div>
            <hr />
            <div className="form-group">
                <label className="form-label">Upload from computer</label>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    style={{display: 'none'}} 
                    accept=".txt,.md"
                />
                <Button 
                    variant="neutral" 
                    onClick={handleChooseFileClick}
                >
                    Choose file (.txt, .md)
                </Button>
            </div>
        </div>
    );
};

type ExportPanelProps = {
    manuscriptText: string;
    metadata: Metadata;
    onSaveMetadata: (data: Metadata) => void;
    onExportProject?: () => void;
    onImportProject?: (data: any) => void;
};

const ExportPanel: FC<ExportPanelProps> = ({ manuscriptText, metadata, onSaveMetadata, onExportProject, onImportProject }) => {
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState<Metadata>(metadata);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        setFormData(metadata);
    }, [metadata]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            setCoverFile(file);

            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleChooseFileClick = () => {
        fileInputRef.current?.click();
    };

    const handleMetadataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
        if (isSaved) setIsSaved(false);
    };

    const handleMetadataSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSaveMetadata(formData);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2500);
    };

    const getSanitizedTitle = () => (metadata.title || 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase();

    const handleTextExport = (format: 'txt' | 'docx' | 'epub' | 'idml') => {
        const blob = new Blob([manuscriptText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${getSanitizedTitle()}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handlePdfExport = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert("Please allow pop-ups to export as PDF.");
            return;
        }

        const content = `
            <html>
                <head>
                    <title>${metadata.title}</title>
                    <style>
                        @media print { @page { size: A4; margin: 2cm; } }
                        body { font-family: 'Times New Roman', Times, serif; margin: 0; line-height: 1.5; color: #000; }
                        h1, h2 { text-align: center; font-family: Arial, sans-serif; border-bottom: 1px solid #ccc; padding-bottom: 0.5em; margin-bottom: 1em; }
                        h1 { font-size: 24pt; }
                        h2 { font-size: 16pt; font-style: italic; border: none; }
                        .cover-image { max-width: 100%; height: auto; display: block; margin: 2em auto; page-break-after: always; }
                        pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: 12pt; }
                    </style>
                </head>
                <body>
                    <h1>${metadata.title}</h1>
                    <h2>by ${metadata.author}</h2>
                    ${previewUrl ? `<img src="${previewUrl}" class="cover-image" alt="Cover" />` : ''}
                    <pre>${manuscriptText}</pre>
                </body>
            </html>`;
            
        printWindow.document.write(content);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    };

    return (
        <div>
            <h3 className="section-title">Metadata</h3>
            <form onSubmit={handleMetadataSubmit}>
                <div className="form-group">
                    <label className="form-label" htmlFor="title">Title</label>
                    <input className="input" type="text" id="title" value={formData.title} onChange={handleMetadataChange} />
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="author">Author</label>
                    <input className="input" type="text" id="author" value={formData.author} onChange={handleMetadataChange} />
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="language">Language</label>
                    <input className="input" type="text" id="language" value={formData.language} onChange={handleMetadataChange} />
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="coverUrl">Cover URL</label>
                    <input className="input" type="url" id="coverUrl" placeholder="https://example.com/cover.jpg" value={formData.coverUrl} onChange={handleMetadataChange} />
                </div>
                <Button variant="primary" type="submit" disabled={isSaved}>
                    {isSaved ? 'Saved!' : 'Save Metadata'}
                </Button>
            </form>

            <hr />
            <div className="form-group">
                <label className="form-label" htmlFor="cover-upload">Upload Cover (Optional)</label>
                <input
                    type="file"
                    accept="image/png, image/jpeg"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    id="cover-upload"
                />
                <Button variant="neutral" onClick={handleChooseFileClick}>
                    {coverFile ? `Selected: ${coverFile.name}` : 'Choose Cover Image...'}
                </Button>
            </div>

            {previewUrl && (
                <div className="cover-preview">
                    <img src={previewUrl} alt="Cover preview" />
                </div>
            )}

            <hr />
            <div className="export-buttons-stack">
                <Button variant="primary" onClick={handlePdfExport}>Export to PDF</Button>
                <Button variant="primary" onClick={() => handleTextExport('epub')}>Export to EPUB</Button>
                <Button variant="primary" onClick={() => handleTextExport('docx')}>Export to DOCX</Button>
                <Button variant="primary" onClick={() => handleTextExport('idml')}>Export to IDML</Button>
                <Button variant="primary" onClick={() => handleTextExport('txt')}>Export to TXT</Button>
            </div>
            
            <hr />
            <div>
                <h3 className="section-title">Project Backup</h3>
                <p className="section-description">
                    Export/import complete project state including text, history, bible, and patches.
                </p>
                <div className="export-buttons-stack">
                    {onExportProject && (
                        <Button variant="success" onClick={onExportProject}>
                            💾 Export Project (.json)
                        </Button>
                    )}
                    {onImportProject && (
                        <Button variant="neutral" onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.json';
                            input.onchange = (e: any) => {
                                const file = e.target.files[0];
                                if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                        try {
                                            const data = JSON.parse(event.target?.result as string);
                                            onImportProject(data);
                                        } catch (err) {
                                            alert('Failed to import project: Invalid file format');
                                        }
                                    };
                                    reader.readAsText(file);
                                }
                            };
                            input.click();
                        }}>
                            📂 Import Project (.json)
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

const EmptyState = ({ message }: { message: string }) => {
    // Split message by double newlines to create paragraphs
    const paragraphs = message.split('\n\n').filter(p => p.trim());
    
    return (
        <div className="empty-state">
            {paragraphs.map((para, index) => (
                <p key={index} style={{ marginBottom: index < paragraphs.length - 1 ? 'var(--space-3)' : '0' }}>
                    {para}
                </p>
            ))}
        </div>
    );
};

type HistoryPanelProps = {
    history: HistoryEntry[];
    onRevert: (id: number) => void;
};

const HistoryPanel: FC<HistoryPanelProps> = ({ history, onRevert }) => {
    const pastHistory = useMemo(() => [...history].reverse(), [history]);

    if (pastHistory.length === 0) {
        return <EmptyState message="No changes have been made yet." />;
    }

    const typeToIcon: Record<HistoryEntry['type'], string> = {
        initial: '🎉',
        manual: '✏️',
        ai: '✨',
        suggestion: '💡',
        revert: '↩️',
        import: '📥',
    };

    return (
        <>
            <h4 className="section-title">History Log</h4>
            <div className="history-list">
                {pastHistory.map(entry => (
                    <div key={entry.id} className="history-item">
                        <div className="history-item-main">
                            <span className="history-item-icon" aria-label={`${entry.type} change`}>
                                {typeToIcon[entry.type] || '📝'}
                            </span>
                            <div className="history-item-details">
                                <p className="history-item-description">{entry.description}</p>
                                <div className="history-item-meta">
                                    <Tag>{entry.version}</Tag>
                                    <span className="history-item-time">
                                        {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                            </div>
                        </div>
                    </div>
                    <Button className="btn-sm" variant="neutral" onClick={() => onRevert(entry.id)}>Revert</Button>
                </div>
            ))}
            </div>
        </>
    );
};


const BiblePanel: FC<{ bible: Bible }> = ({ bible }) => {
    if (bible.characters.length === 0 && bible.world.locations.length === 0 && bible.glossary.length === 0 && bible.timeline.length === 0) {
        return <EmptyState message="The story bible is empty. Ask the agent to build it or use the corresponding quick command!" />;
    }

    return (
        <div className="bible-panel">
            {bible.characters.length > 0 && (
                <div className="bible-section">
                    <h4>Characters</h4>
                    {bible.characters.map(char => (
                        <div key={char.id} className="bible-item">
                            <strong>{char.names.join(' / ')}</strong> (Confidence: {char.confidence})
                        </div>
                    ))}
                </div>
            )}
            {bible.world.locations.length > 0 && (
                <div className="bible-section">
                    <h4>World</h4>
                    {bible.world.locations.map(loc => (
                        <div key={loc.id} className="bible-item">
                            <strong>{loc.id}</strong>: {loc.desc} (Confidence: {loc.confidence})
                        </div>
                    ))}
                </div>
            )}
            {bible.glossary.length > 0 && (
                <div className="bible-section">
                    <h4>Glossary</h4>
                    {bible.glossary.map(item => (
                        <div key={item.term} className="bible-item">
                            <strong>{item.term}</strong>: {item.traits.join(', ')}
                        </div>
                    ))}
                </div>
            )}
            {bible.timeline.length > 0 && (
                <div className="bible-section">
                    <h4>Timeline</h4>
                    {bible.timeline.map((event, idx) => (
                        <div key={`${event.t}-${idx}`} className="bible-item">
                            <strong>{event.t}</strong>: {event.event}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


const RulesPanel: FC<{ 
    rules: ManuscriptRules; 
    onSave: (rules: ManuscriptRules) => void;
    editRange: string;
    onEditRangeChange: (range: string) => void;
}> = ({ rules, onSave, editRange, onEditRangeChange }) => {
    const [formData, setFormData] = useState<ManuscriptRules>(rules);
    const [isSaved, setIsSaved] = useState(false);
    const [newConstraint, setNewConstraint] = useState('');
    const [newForbiddenWord, setNewForbiddenWord] = useState('');
    const [newPreferredWord, setNewPreferredWord] = useState('');
    const [newCharacterName, setNewCharacterName] = useState('');

    useEffect(() => {
        setFormData(rules);
    }, [rules]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2500);
    };

    const addConstraint = () => {
        if (newConstraint.trim()) {
            setFormData(prev => ({ ...prev, constraints: [...prev.constraints, newConstraint.trim()] }));
            setNewConstraint('');
        }
    };

    const removeConstraint = (index: number) => {
        setFormData(prev => ({ ...prev, constraints: prev.constraints.filter((_, i) => i !== index) }));
    };

    const addForbiddenWord = () => {
        if (newForbiddenWord.trim()) {
            setFormData(prev => ({ ...prev, vocabulary: { ...prev.vocabulary, forbidden: [...prev.vocabulary.forbidden, newForbiddenWord.trim()] } }));
            setNewForbiddenWord('');
        }
    };

    const removeForbiddenWord = (index: number) => {
        setFormData(prev => ({ ...prev, vocabulary: { ...prev.vocabulary, forbidden: prev.vocabulary.forbidden.filter((_, i) => i !== index) } }));
    };

    const addPreferredWord = () => {
        if (newPreferredWord.trim()) {
            setFormData(prev => ({ ...prev, vocabulary: { ...prev.vocabulary, preferred: [...prev.vocabulary.preferred, newPreferredWord.trim()] } }));
            setNewPreferredWord('');
        }
    };

    const removePreferredWord = (index: number) => {
        setFormData(prev => ({ ...prev, vocabulary: { ...prev.vocabulary, preferred: prev.vocabulary.preferred.filter((_, i) => i !== index) } }));
    };

    const addCharacter = () => {
        if (newCharacterName.trim()) {
            setFormData(prev => ({ ...prev, characters: [...prev.characters, { name: newCharacterName.trim(), aliases: [], notes: '' }] }));
            setNewCharacterName('');
        }
    };

    const removeCharacter = (index: number) => {
        setFormData(prev => ({ ...prev, characters: prev.characters.filter((_, i) => i !== index) }));
    };

    const updateCharacter = (index: number, field: 'aliases' | 'notes', value: string) => {
        setFormData(prev => ({
            ...prev,
            characters: prev.characters.map((char, i) => 
                i === index ? { ...char, [field]: field === 'aliases' ? value.split(',').map(s => s.trim()) : value } : char
            )
        }));
    };

    const ranges = ['selection', 'scene', 'chapter', 'book'];
    
    return (
        <form onSubmit={handleSubmit} className="rules-panel">
            <div className="form-group">
                <label className="form-label">Editing Range</label>
                <div className="range-selector-buttons">
                    {ranges.map(range => (
                        <Button
                            key={range}
                            type="button"
                            variant={editRange === range ? 'primary' : 'neutral'}
                            className="btn-sm"
                            onClick={() => onEditRangeChange(range)}
                        >
                            {range.charAt(0).toUpperCase() + range.slice(1)}
                        </Button>
                    ))}
                </div>
            </div>
            
            <div className="form-group" style={{ marginTop: '24px' }}>
                <label className="form-label">Point of View (POV)</label>
                <select className="input" value={formData.pov} onChange={(e) => setFormData(prev => ({ ...prev, pov: e.target.value as any }))}>
                    <option value="first">First Person (I, we)</option>
                    <option value="third">Third Person (he, she, they)</option>
                    <option value="mixed">Mixed</option>
                </select>
            </div>

            <div className="form-group">
                <label className="form-label">Tense</label>
                <select className="input" value={formData.tense} onChange={(e) => setFormData(prev => ({ ...prev, tense: e.target.value as any }))}>
                    <option value="past">Past Tense</option>
                    <option value="present">Present Tense</option>
                    <option value="mixed">Mixed</option>
                </select>
            </div>

            <div className="form-group">
                <label className="form-label">Writing Style</label>
                <input className="input" type="text" placeholder="e.g., Hemingway, Tolkien, Modern Literary" value={formData.style} onChange={(e) => setFormData(prev => ({ ...prev, style: e.target.value }))} />
            </div>

            <div className="form-group">
                <label className="form-label">Constraints</label>
                {formData.constraints.length > 0 && (
                    <div className="tag-list">
                        {formData.constraints.map((constraint, i) => (
                            <span key={i} className="tag-removable">
                                {constraint}
                                <button type="button" onClick={() => removeConstraint(i)}>×</button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="input-with-button">
                    <input className="input" type="text" placeholder="Add constraint..." value={newConstraint} onChange={(e) => setNewConstraint(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addConstraint())} />
                    <Button type="button" variant="neutral" className="btn-sm" onClick={addConstraint}>Add</Button>
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Forbidden Words</label>
                {formData.vocabulary.forbidden.length > 0 && (
                    <div className="tag-list">
                        {formData.vocabulary.forbidden.map((word, i) => (
                            <span key={i} className="tag-removable tag-danger">
                                {word}
                                <button type="button" onClick={() => removeForbiddenWord(i)}>×</button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="input-with-button">
                    <input className="input" type="text" placeholder="Add forbidden word..." value={newForbiddenWord} onChange={(e) => setNewForbiddenWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addForbiddenWord())} />
                    <Button type="button" variant="neutral" className="btn-sm" onClick={addForbiddenWord}>Add</Button>
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Preferred Words</label>
                {formData.vocabulary.preferred.length > 0 && (
                    <div className="tag-list">
                        {formData.vocabulary.preferred.map((word, i) => (
                            <span key={i} className="tag-removable tag-success">
                                {word}
                                <button type="button" onClick={() => removePreferredWord(i)}>×</button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="input-with-button">
                    <input className="input" type="text" placeholder="Add preferred word..." value={newPreferredWord} onChange={(e) => setNewPreferredWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPreferredWord())} />
                    <Button type="button" variant="neutral" className="btn-sm" onClick={addPreferredWord}>Add</Button>
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Characters</label>
                {formData.characters.map((char, i) => (
                    <div key={i} className="character-item">
                        <div className="character-header">
                            <strong>{char.name}</strong>
                            <button type="button" className="btn-remove" onClick={() => removeCharacter(i)}>×</button>
                        </div>
                        <input className="input input-sm" type="text" placeholder="Aliases (comma-separated)" value={char.aliases.join(', ')} onChange={(e) => updateCharacter(i, 'aliases', e.target.value)} />
                        <textarea className="input input-sm" placeholder="Notes..." value={char.notes} onChange={(e) => updateCharacter(i, 'notes', e.target.value)} rows={2} />
                    </div>
                ))}
                <div className="input-with-button">
                    <input className="input" type="text" placeholder="Add character name..." value={newCharacterName} onChange={(e) => setNewCharacterName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCharacter())} />
                    <Button type="button" variant="neutral" className="btn-sm" onClick={addCharacter}>Add</Button>
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Custom Instructions</label>
                <textarea className="input" placeholder="Any additional instructions for the AI..." value={formData.customInstructions} onChange={(e) => setFormData(prev => ({ ...prev, customInstructions: e.target.value }))} rows={4} />
            </div>

            <Button variant="primary" type="submit" disabled={isSaved}>
                {isSaved ? 'Saved!' : 'Save Rules'}
            </Button>
        </form>
    );
};

// --- MAIN LAYOUT PANELS ---

type ChatPanelProps = {
    messages: ChatMessageData[];
    onSendMessage: (message: string) => void;
    isLoading: boolean;
    onClearHistory?: () => void;
};

const ChatPanel: FC<ChatPanelProps> = ({ messages, onSendMessage, isLoading, onClearHistory }) => (
  <div className="panel chat-panel">
    <div className="panel-header">
      <span>TextFlow</span>
    </div>
    <QuickPhrases onSelectPhrase={onSendMessage} isLoading={isLoading} onClearHistory={messages.length > 1 ? onClearHistory : undefined}/>
    <div className="panel-content chat-messages">
      {messages.map((msg) => <ChatMessage key={msg.id} msg={msg} />)}
    </div>
    <ChatComposer onSendMessage={onSendMessage} isLoading={isLoading} />
  </div>
);

type DiffPanelProps = {
    patches: Patch[];
    selectedPatch: Patch;
    onSelectPatch: (id: string) => void;
    onAccept: (patch: Patch) => void;
    onSkip: (id: string) => void;
};

const DiffPanel: FC<DiffPanelProps> = ({ patches, selectedPatch, onSelectPatch, onAccept, onSkip }) => {
    const afterText = Array.isArray(selectedPatch.after_proposed) ? selectedPatch.after_proposed[0] : selectedPatch.after_proposed;

    return (
        <div className="diff-panel">
            <div className="diff-panel-sidebar">
                <h4 className="diff-panel-title">Pending Patches ({patches.length})</h4>
                <div className="patch-list">
                    {patches.map(p => (
                        <button 
                            key={p.patch_id} 
                            className={`patch-list-item ${p.patch_id === selectedPatch.patch_id ? 'active' : ''}`}
                            onClick={() => onSelectPatch(p.patch_id)}
                        >
                            <span className="patch-list-item-goal">{p.rationale?.goal || 'No goal'}</span>
                            <span className="patch-list-item-target">Target: {p.target?.anchor?.split(':')[0] || 'Unknown'}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="diff-panel-main">
                <div className="diff-view">
                    <div className="diff-chunk">
                        <div className="diff-header">Before</div>
                        <div className="diff-content">
                            <del>{selectedPatch.before_excerpt}</del>
                        </div>
                    </div>
                    <div className="diff-chunk">
                        <div className="diff-header">After</div>
                        <div className="diff-content">
                            <ins>{afterText}</ins>
                        </div>
                    </div>
                </div>
                 <div className="diff-controls">
                    <Button variant="success" className="btn-sm" onClick={() => onAccept(selectedPatch)}>Accept (A)</Button>
                    <Button variant="danger" className="btn-sm" onClick={() => onSkip(selectedPatch.patch_id)}>Skip (S)</Button>
                    <div className="diff-navigation">
                        <Button variant="neutral" className="btn-sm" onClick={() => {
                            const currentIndex = patches.findIndex(p => p.patch_id === selectedPatch.patch_id);
                            const prevIndex = currentIndex === 0 ? patches.length - 1 : currentIndex - 1;
                            onSelectPatch(patches[prevIndex].patch_id);
                        }}>← Prev (P)</Button>
                        <Button variant="neutral" className="btn-sm" onClick={() => {
                            const currentIndex = patches.findIndex(p => p.patch_id === selectedPatch.patch_id);
                            const nextIndex = (currentIndex + 1) % patches.length;
                            onSelectPatch(patches[nextIndex].patch_id);
                        }}>Next (N) →</Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

type StreamingIndicatorProps = {
    isStreaming: boolean;
    onCancel: () => void;
};

const StreamingIndicator: FC<StreamingIndicatorProps> = ({ isStreaming, onCancel }) => {
    if (!isStreaming) return null;
    
    return (
        <div className="streaming-indicator">
            <div className="streaming-indicator-content">
                <span className="streaming-indicator-text">
                    <span className="streaming-dot"></span>
                    <span className="streaming-dot"></span>
                    <span className="streaming-dot"></span>
                    AI is writing...
                </span>
                <button className="streaming-cancel-btn" onClick={onCancel}>
                    Cancel (Esc)
                </button>
            </div>
        </div>
    );
};

type EditorPanelProps = {
    text: string;
    onTextChange: (text: string) => void;
    error: string | null;
    annotations: Annotation[];
    pendingPatches: Patch[];
    selectedPatch: Patch | undefined;
    onSelectPatch: (id: string) => void;
    onAcceptPatch: (patch: Patch) => void;
    onSkipPatch: (id: string) => void;
    editorRef: React.Ref<EditorHandle>;
    highlightedParaIndex: number | null;
    highlightedText?: string;
    onSelectionChange?: (selection: { start: number; end: number; text: string }) => void;
    isStreaming?: boolean;
    onCancelStreaming?: () => void;
    fontSize: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
}

const EditorPanel: FC<EditorPanelProps> = ({ 
    text, 
    onTextChange, 
    error, 
    annotations,
    pendingPatches,
    selectedPatch,
    onSelectPatch,
    onAcceptPatch,
    onSkipPatch,
    editorRef,
    highlightedParaIndex,
    highlightedText,
    onSelectionChange,
    isStreaming,
    onCancelStreaming,
    fontSize,
    onZoomIn,
    onZoomOut,
}) => {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    
    return (
        <main className="panel editor-panel">
            {error && <div className="error-banner">{error}</div>}
            {isStreaming && onCancelStreaming && (
                <StreamingIndicator isStreaming={isStreaming} onCancel={onCancelStreaming} />
            )}
            <div className="editor-toolbar">
                <div className="editor-stats">
                    <span className="stat-item">Words: {wordCount.toLocaleString()}</span>
                    <span className="stat-item">Characters: {text.length.toLocaleString()}</span>
                    <div className="zoom-controls">
                        <button className="zoom-btn" onClick={onZoomOut} title="Decrease font size">−</button>
                        <button className="zoom-btn" onClick={onZoomIn} title="Increase font size">+</button>
                    </div>
                </div>
            </div>
            <EditableTextArea ref={editorRef} text={text} onTextChange={onTextChange} annotations={annotations} highlightedParaIndex={highlightedParaIndex} highlightedText={highlightedText} onSelectionChange={onSelectionChange} fontSize={fontSize}/>
            {pendingPatches.length > 0 && selectedPatch && (
                <DiffPanel
                    patches={pendingPatches}
                    selectedPatch={selectedPatch}
                    onSelectPatch={onSelectPatch}
                    onAccept={onAcceptPatch}
                    onSkip={onSkipPatch}
                />
            )}
        </main>
    );
}

type SidebarProps = {
    annotations: Annotation[];
    manuscriptText: string;
    history: HistoryEntry[];
    metadata: Metadata;
    bible: Bible;
    manuscriptRules: ManuscriptRules;
    aiContext: AIContext;
    performanceLog: PerformanceLogEntry[];
    onAcceptAnnotation: (annotation: Annotation) => void;
    onRejectAnnotation: (id: number) => void;
    onAcceptAll: () => void;
    onRejectAll: () => void;
    onRevertToHistory: (id: number) => void;
    onRunPipeline: () => void;
    isPipelineLoading: boolean;
    pipelineProgress: number;
    onSaveMetadata: (data: Metadata) => void;
    onSaveRules: (rules: ManuscriptRules) => void;
    onUpdateContext: (context: AIContext) => void;
    onNavigateToSearchResult: (paragraphIndex: number) => void;
    onTextImport: (text: string) => void;
    onExportProject: () => void;
    onImportProject: (data: any) => void;
    editRange: string;
    onEditRangeChange: (range: string) => void;
};

const Sidebar: FC<SidebarProps> = ({
    annotations,
    manuscriptText,
    history,
    metadata,
    bible,
    manuscriptRules,
    aiContext,
    performanceLog,
    onAcceptAnnotation,
    onRejectAnnotation,
    onAcceptAll,
    onRejectAll,
    onRevertToHistory,
    onRunPipeline,
    isPipelineLoading,
    pipelineProgress,
    onSaveMetadata,
    onSaveRules,
    onUpdateContext,
    onNavigateToSearchResult,
    onTextImport,
    onExportProject,
    onImportProject,
    editRange,
    onEditRangeChange
}) => {
    const [activeTab, setActiveTab] = useState('Rules');

    const renderTabContent = () => {
        switch (activeTab) {
            case 'Proofreading':
                return (
                    <>
                        <div className="run-pipeline-container">
                            <ProgressBar value={pipelineProgress} className={pipelineProgress > 0 && pipelineProgress < 100 ? 'visible' : ''} />
                            <Button variant="primary" onClick={onRunPipeline} disabled={isPipelineLoading}>
                                {isPipelineLoading ? 'Running...' : 'Run Proofreading Pipeline (Ctrl+R)'}
                            </Button>
                        </div>
                        {annotations.length > 0 ? (
                            <>
                              <div className="annotation-bulk-actions">
                                <Button variant="success" onClick={onAcceptAll}>Accept All</Button>
                                <Button variant="danger" onClick={onRejectAll}>Reject All</Button>
                              </div>
                              {annotations.map(ann => <AnnotationCard key={ann.id} annotation={ann} onAccept={onAcceptAnnotation} onReject={onRejectAnnotation} />)}
                            </>
                          ) : (
                            <EmptyState message="This is the final stage of editing that occurs after the manuscript has already gone through other editing stages (in our case, this is Quick Commands) and has been formatted into a print-ready layout.


No annotations yet. Run the pipeline to generate them." />
                          )
                        }
                    </>
                  );
            case 'History':
                return <HistoryPanel history={history} onRevert={onRevertToHistory} />;
            case 'Bible':
                return <BiblePanel bible={bible} />;
            case 'Rules':
                return <RulesPanel rules={manuscriptRules} onSave={onSaveRules} editRange={editRange} onEditRangeChange={onEditRangeChange} />;
            case 'Context':
                return <ContextPanel context={aiContext} bible={bible} rules={manuscriptRules} onUpdateContext={onUpdateContext} />;
            case 'Search':
                return <SearchPanel manuscriptText={manuscriptText} onNavigateToResult={onNavigateToSearchResult} />;
            case 'Metrics':
                return <MetricsPanel text={manuscriptText} performanceLog={performanceLog} />;
            case 'Import':
                return <ImportPanel onTextImport={onTextImport} />;
            case 'Export':
                return <ExportPanel manuscriptText={manuscriptText} metadata={metadata} onSaveMetadata={onSaveMetadata} onExportProject={onExportProject} onImportProject={onImportProject} />;
            default:
                return null;
        }
    };

    const tabs = ['Import', 'Rules', 'Bible', 'Context', 'Search', 'Proofreading', 'Metrics', 'History', 'Export'];

    return (
        <aside className="panel sidebar">
            <div className="tabs">
                {tabs.map(tab => (
                     <button key={tab} className={`tab-button ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</button>
                ))}
            </div>
            <div className="tab-content">
                {renderTabContent()}
            </div>
        </aside>
    );
};

// --- APP ---

const generateChangeSummary = async (oldText: string, newText: string): Promise<string> => {
    if (oldText === newText) return "No changes made.";
    const prompt = `You are an expert at summarizing document changes. Below are two versions of a text, 'OLD' and 'NEW'. Briefly describe what was changed to get from OLD to NEW. Focus on the substance (e.g., 'Corrected a typo in the first paragraph', 'Rewrote the sentence about Winston', 'Added a new paragraph about the hallway'). Be very concise, your response should be a short phrase, like a git commit message.

OLD:
---
${oldText.slice(0, 2000)}
---

NEW:
---
${newText.slice(0, 2000)}
---

Change Description:`;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 0 },
                temperature: 0.1,
                topK: 1
            }
        });
        const summary = result.text.trim();
        return summary || 'Manual Edit';
    } catch (error) {
        console.error("Error generating change summary:", error);
        return 'Manual Edit';
    }
};

/**
 * Creates a simple, non-cryptographic hash of a string.
 * @param str The string to hash.
 * @returns A hexadecimal hash string.
 */
const simpleHash = (str: string): string => {
    let hash = 0;
    if (str.length === 0) return '0';
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
};

// Reusable metrics function
const getMetricsForText = async (text: string) => {
    const scorePrompt = `You are a literary critic AI. Analyze the following text based on several metrics and return a JSON object with your scores. The metrics are:
- hook: How well does the text grab the reader's attention? (0.0 to 1.0)
- clarity: How clear and understandable is the writing? (0.0 to 1.0)
- tension: How much suspense or tension is built? (0.0 to 1.0)
- voice: How strong and consistent is the author's or character's voice? (0.0 to 1.0)
- pacing: How well is the story paced? (0.0 to 1.0)
- continuity: Are there any obvious continuity errors? ("pass" or "fail")

Your response MUST be a single JSON object with these keys and corresponding values.

Text to analyze:
"""
${text}
"""`;

    const scoreSchema = {
        type: Type.OBJECT,
        properties: {
            hook: { type: Type.NUMBER },
            clarity: { type: Type.NUMBER },
            tension: { type: Type.NUMBER },
            voice: { type: Type.NUMBER },
            pacing: { type: Type.NUMBER },
            continuity: { type: Type.STRING },
        },
        required: ["hook", "clarity", "tension", "voice", "pacing", "continuity"],
    };

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: scorePrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: scoreSchema,
                thinkingConfig: { thinkingBudget: 0 },
            },
        });
        const scores = JSON.parse(result.text);
        if (scores.continuity !== 'pass' && scores.continuity !== 'fail') {
            scores.continuity = 'pass';
        }
        return scores;
    } catch (e) {
        console.error("Error in getMetricsForText:", e);
        return { hook: 0, clarity: 0, tension: 0, voice: 0, pacing: 0, continuity: "fail" };
    }
};

const generateNextVersion = (history: HistoryEntry[], type: HistoryEntry['type']): string => {
    const latestVersion = history[history.length - 1]?.version || 'v1.0.0';
    const parts = latestVersion.replace('v', '').split('.').map(Number);
    let [major, minor, patch] = parts;

    switch(type) {
        case 'import':
        case 'initial':
            major += 1;
            minor = 0;
            patch = 0;
            break;
        case 'ai':
        case 'suggestion':
            minor += 1;
            patch = 0;
            break;
        case 'manual':
        case 'revert':
            patch += 1;
            break;
    }

    return `v${major}.${minor}.${patch}`;
};

// --- LOCALSTORAGE HELPERS ---
const STORAGE_KEY = 'manuscript-editor-state';

const loadFromLocalStorage = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Convert timestamp strings back to Date objects
      if (parsed.historyStack) {
        parsed.historyStack = parsed.historyStack.map((entry: any) => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }));
      }
      if (parsed.performanceLog) {
        parsed.performanceLog = parsed.performanceLog.map((entry: any) => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }));
      }
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
  }
  return null;
};

const saveToLocalStorage = (state: any) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
};

const App = () => {
  const savedState = loadFromLocalStorage();
  
  const [manuscriptText, setManuscriptText] = useState(savedState?.manuscriptText || INITIAL_TEXT);
  const [historyStack, setHistoryStack] = useState<HistoryEntry[]>(
    savedState?.historyStack || [
      { id: Date.now(), timestamp: new Date(), text: savedState?.manuscriptText || INITIAL_TEXT, description: 'Initial Document', type: 'initial', version: 'v1.0.0' }
    ]
  );
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>(
    savedState?.chatMessages || [
      { id: 'init-1', sender: 'agent', name: 'TextFlow', avatar: 'BC', text: 'Hello! I am the TextFlow agent. Describe the edits you need for your manuscript, and I will create a plan to execute them.' },
    ]
  );
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isPipelineLoading, setIsPipelineLoading] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Metadata>(
    savedState?.metadata || {
      title: 'Untitled Document',
      author: 'Unknown Author',
      language: 'English',
      coverUrl: '',
    }
  );
  const [bible, setBible] = useState<Bible>(
    savedState?.bible || {
      characters: [],
      world: { locations: [] },
      glossary: [],
      timeline: [],
    }
  );
  const [manuscriptRules, setManuscriptRules] = useState<ManuscriptRules>(
    savedState?.manuscriptRules || {
      pov: 'third',
      tense: 'past',
      style: '',
      constraints: [],
      vocabulary: { forbidden: [], preferred: [] },
      characters: [],
      customInstructions: '',
    }
  );
  const [performanceLog, setPerformanceLog] = useState<PerformanceLogEntry[]>(savedState?.performanceLog || []);
  const [pendingPatches, setPendingPatches] = useState<Patch[]>(savedState?.pendingPatches || []);
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(savedState?.selectedPatchId || null);
  const [editRange, setEditRange] = useState('book');
  const [highlightedParaIndex, setHighlightedParaIndex] = useState<number | null>(null);
  const [highlightedText, setHighlightedText] = useState<string | undefined>(undefined);
  const [inlineEditVisible, setInlineEditVisible] = useState(false);
  const [inlineEditSelection, setInlineEditSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [isInlineEditLoading, setIsInlineEditLoading] = useState(false);
  const [streamingText, setStreamingText] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
  const [aiContext, setAiContext] = useState<AIContext>(
    savedState?.aiContext || {
      includeRules: true,
      includeBible: false,
      selectedCharacters: [],
      selectedLocations: [],
      customNotes: '',
    }
  );
  const [fontSize, setFontSize] = useState(16);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const editorRef = useRef<EditorHandle>(null);
  const streamingAbortController = useRef<AbortController | null>(null);

  
  const { paragraphs, paragraphStartLines } = useMemo(() => {
        const paras = manuscriptText.split(/\n\s*\n/);
        const startLines: number[] = [];
        let currentLine = 0;
        for (const p of paras) {
            startLines.push(currentLine);
            const numLines = p.split('\n').length;
            currentLine += numLines + (p.length > 0 ? 1 : 0);
        }
        return { paragraphs: paras, paragraphStartLines: startLines };
    }, [manuscriptText]);

  const chat = useMemo(() => {
      const editingTools: FunctionDeclaration[] = [
          {
              name: 'get_document_context',
              description: 'Return text and contexts for a given range.',
              parameters: {
                  type: Type.OBJECT,
                  properties: {
                      range: {
                          type: Type.STRING,
                          description: 'The range of the document to get context for. Can be "selection", "chapter:X", or "book".',
                      },
                  },
                  required: ['range'],
              },
          },
          {
              name: 'execute_edit_plan',
              description: 'Executes a full editing cascade: applies patches after running checks, and returns a report with before/after metrics.',
              parameters: {
                  type: Type.OBJECT,
                  properties: {
                      plan: { type: Type.ARRAY, items: {type: Type.STRING}, description: 'An array of strings describing the plan.' },
                      patches: {
                          type: Type.ARRAY,
                          description: 'An array of Patch objects to apply.',
                          items: { 
                              type: Type.OBJECT,
                              properties: {
                                  patch_id: { type: Type.STRING, description: 'Unique identifier for this patch' },
                                  target: {
                                      type: Type.OBJECT,
                                      description: 'Location of the text to edit',
                                      properties: {
                                          chapter: { type: Type.NUMBER },
                                          scene: { type: Type.NUMBER },
                                          para: { type: Type.NUMBER },
                                          anchor: { type: Type.STRING, description: 'Format: p{N}:{hash}' }
                                      },
                                      required: ['anchor']
                                  },
                                  type: { type: Type.STRING, description: 'Type of edit: replace, insert, delete, or move' },
                                  constraints: { type: Type.ARRAY, items: { type: Type.STRING } },
                                  before_excerpt: { type: Type.STRING, description: 'Original text to be replaced' },
                                  after_proposed: { type: Type.STRING, description: 'New text or array of alternatives for A/B testing' },
                                  rationale: {
                                      type: Type.OBJECT,
                                      properties: {
                                          goal: { type: Type.STRING },
                                          checks: { type: Type.OBJECT }
                                      },
                                      required: ['goal']
                                  }
                              },
                              required: ['target', 'before_excerpt', 'after_proposed', 'rationale']
                          },
                      },
                  },
                  required: ['plan', 'patches'],
              },
          },
          {
              name: 'refresh_bible',
              description: 'Update the auto-bible (canon) with new information.',
              parameters: {
                  type: Type.OBJECT,
                  properties: {
                      delta: {
                          type: Type.OBJECT,
                          description: 'An object containing arrays of items to add or update in the bible.',
                      },
                  },
                  required: ['delta'],
              },
          },
          {
            name: 'analyze_manuscript_for_bible',
            description: 'Analyzes the entire manuscript to extract a draft of the story bible, including characters, world locations, glossary, and timeline.',
            parameters: {
                type: Type.OBJECT,
                properties: {},
            },
          },
      ];

      const rulesSection = `

**MANUSCRIPT RULES (MUST FOLLOW):**
${manuscriptRules.pov !== 'mixed' ? `- Point of View: ${manuscriptRules.pov === 'first' ? 'FIRST PERSON (I, we)' : 'THIRD PERSON (he, she, they)'} - NEVER change this!` : ''}
${manuscriptRules.tense !== 'mixed' ? `- Tense: ${manuscriptRules.tense.toUpperCase()} - Keep consistent!` : ''}
${manuscriptRules.style ? `- Writing Style: ${manuscriptRules.style} - Match this style in all edits.` : ''}
${manuscriptRules.constraints.length > 0 ? `- Constraints:\n${manuscriptRules.constraints.map(c => `  * ${c}`).join('\n')}` : ''}
${manuscriptRules.vocabulary.forbidden.length > 0 ? `- Forbidden Words: ${manuscriptRules.vocabulary.forbidden.join(', ')} - NEVER use these!` : ''}
${manuscriptRules.vocabulary.preferred.length > 0 ? `- Preferred Words: ${manuscriptRules.vocabulary.preferred.join(', ')} - Use these when appropriate.` : ''}
${manuscriptRules.characters.length > 0 ? `- Characters:\n${manuscriptRules.characters.map(c => `  * ${c.name}${c.aliases.length > 0 ? ` (aliases: ${c.aliases.join(', ')})` : ''}${c.notes ? ` - ${c.notes}` : ''}`).join('\n')}` : ''}
${manuscriptRules.customInstructions ? `- Custom Instructions: ${manuscriptRules.customInstructions}` : ''}
`;

      return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            temperature: 0.5,
            systemInstruction: `You are TextFlow, an expert manuscript editing agent and literary analyst. You can perform TWO types of tasks:

**TYPE 1: ANALYSIS TASKS** (e.g., "Analyze the character arc", "Check for continuity errors", "Evaluate pacing")
For analysis requests, you should:
1. Call \`get_document_context\` to retrieve the relevant text
2. Perform a thorough analysis based on the user's request
3. Provide detailed insights, observations, and recommendations
4. You do NOT need to generate patches for pure analysis tasks
5. Present your analysis in a clear, structured format

**TYPE 2: EDITING TASKS** (e.g., "Tighten the prose", "Fix passive voice", "Improve dialogue")
For editing requests, follow the strict "Cascade" workflow:
${rulesSection}
**THE CASCADE WORKFLOW:**
1.  **Analyze & Plan:** Read the user's request and the provided document context. Create a short, actionable plan (a TODO list) outlining the steps you'll take.
2.  **Generate Patches:** For each step in your plan, generate minimal, precise patches. Each patch MUST include a \`rationale\` with your goal and checks. For stylistic or complex changes, you MAY provide multiple options in \`after_proposed\` as an array of strings for A/B testing.
3.  **Execute:** Call the \`execute_edit_plan\` tool with your \`plan\` and \`patches\`. This tool will run its own checks (Style, POV) and apply only the valid patches. It will also calculate quality metrics before and after the edit, and automatically select the best option in an A/B test.
4.  **Report:** After the tool runs, you will receive a detailed result. Your final task is to present this result to the user. Start with a brief, natural language summary of what you did. Then, provide a single, final JSON block containing a comprehensive report of the entire operation.

The user may provide an editing range prefix in their prompt, like '(Editing range: Chapter)'. You MUST prioritize this range when calling get_document_context.

**FINAL REPORT JSON STRUCTURE:**
Your final response to the user MUST contain a JSON object with the following structure:
{
  "summary": "A one-sentence summary of the edit.",
  "plan_executed": ["The plan you created."],
  "patches_generated": [/* all patches you sent to the tool */],
  "apply_result": { "applied": ["patch_id_1"], "skipped": [{"id": "patch_id_2", "reason": "Style fail"}] },
  "checks_summary": [/* summary of checks from the tool */],
  "metrics_comparison": {
    "before": { "hook": 0.5, "clarity": 0.6, "tension": 0.5, "voice": 0.7, "pacing": 0.5, "continuity": "pass" },
    "after": { "hook": 0.7, "clarity": 0.8, "tension": 0.6, "voice": 0.7, "pacing": 0.5, "continuity": "pass" }
  },
  "bible_delta": { /* any proposed bible updates */ }
}

**RULES:**
- Patches MUST be minimal. Do not rewrite entire paragraphs if a sentence will do.
- Your \`Continuity\` check in the patch rationale is critical. If your change might conflict with the story bible, mark it as "fail". The tool will reject it.
- Use the full \`cXsYpZ:hash\` anchor for all patches.
- **CRITICAL:** The \`before_excerpt\` field MUST contain the EXACT text from the document that you want to replace, including all punctuation, spacing, and surrounding context. The system uses exact string matching. If you want to delete "BIG BROTHER IS WATCHING YOU" but it appears as "BIG BROTHER IS WATCHING YOU, the caption beneath it ran." in the text, you MUST include the full phrase with punctuation in \`before_excerpt\`.`,
            tools: [{ functionDeclarations: editingTools }],
        },
      });
  }, [manuscriptRules]);

  const addHistoryEntry = (newText: string, description: string, type: HistoryEntry['type']) => {
    setHistoryStack(prev => {
      if (prev.length > 0 && prev[prev.length - 1].text === newText) {
        return prev;
      }
      const newVersion = generateNextVersion(prev, type);
      return [...prev, { id: Date.now(), timestamp: new Date(), text: newText, description, type, version: newVersion }];
    });
  };

  const updateManuscriptAndHistory = (newText: string, description: string, type: HistoryEntry['type']) => {
    setManuscriptText(newText);
    addHistoryEntry(newText, description, type);
  };
  
  // This object acts as the "backend" for the AI's function calls,
  // implementing the logic for each tool the model can use.
  const toolImplementations = {
      get_document_context: ({ range }: { range: string }) => {
          console.log(`Tool: get_document_context, range: ${range}`);
          return {
              text: manuscriptText,
              anchors: paragraphs.map((p, i) => `c1s1p${i + 1}:${simpleHash(p)}`),
              rules: {
                  pov: "third",
                  style: { adverbs_max_per_page: 5, passive_max_pct: 10, sentence_len_target: [8, 18] },
                  constraints: { forbid_new_lore: true, forbid_new_proper_nouns: true }
              },
              memory: bible
          };
      },
      execute_edit_plan: async ({ plan, patches }: { plan: string[], patches: Patch[] }) => {
        console.log(`Tool: execute_edit_plan (STAGING FOR REVIEW)`, { plan, patches });

        // Validate and filter patches
        const validPatches = patches.filter(p => {
            if (!p.target?.anchor) {
                console.warn('Invalid patch: missing target.anchor', p);
                return false;
            }
            if (!p.before_excerpt) {
                console.warn('Invalid patch: missing before_excerpt', p);
                return false;
            }
            // after_proposed can be empty string for delete operations, so only check for undefined/null
            if (p.after_proposed === undefined || p.after_proposed === null) {
                console.warn('Invalid patch: missing after_proposed', p);
                return false;
            }
            if (!p.rationale?.goal) {
                console.warn('Invalid patch: missing rationale.goal', p);
                return false;
            }
            return true;
        });

        if (validPatches.length < patches.length) {
            console.warn(`Filtered out ${patches.length - validPatches.length} invalid patches`);
        }

        // Add patches to the user review queue instead of applying them.
        const patchesWithIds = validPatches.map(p => ({ ...p, patch_id: p.patch_id || `patch_${Date.now()}_${Math.random()}` }));
        setPendingPatches(prev => [...prev, ...patchesWithIds]);
        if (patchesWithIds.length > 0 && !selectedPatchId) {
            setSelectedPatchId(patchesWithIds[0].patch_id);
        }

        // Fake a response to keep the agent's workflow consistent.
        // The agent will report success, while the user reviews the patches.
        const skippedCount = patches.length - validPatches.length;
        return {
            plan_executed: plan,
            summary: `Generated ${validPatches.length} valid patch(es) for user review${skippedCount > 0 ? ` (${skippedCount} invalid patches filtered out)` : ''}.`,
            apply_result: { applied: validPatches.map(p => p.patch_id), skipped: patches.filter(p => !validPatches.includes(p)).map(p => p.patch_id || 'unknown') },
            checks_results: validPatches.map(p => ({
                patch_id: p.patch_id,
                continuity: { pass: true, message: "Pass (User Review Pending)" },
                style: { pass: true, details: {} },
                pov: { pass: true, message: 'POV consistent.' },
            })),
            metrics_comparison: { 
                before: { hook: 0.5, clarity: 0.5, tension: 0.5, voice: 0.5, pacing: 0.5, continuity: "pass" },
                after: { hook: 0.5, clarity: 0.5, tension: 0.5, voice: 0.5, pacing: 0.5, continuity: "pass" } 
            }
        };
      },
      refresh_bible: ({ delta }: { delta: BibleDelta }) => {
          console.log(`Tool: refresh_bible`, delta);
          let updatedBible: Bible | null = null;
      
          setBible(currentBible => {
              const newBible = JSON.parse(JSON.stringify(currentBible)); // Deep copy for safety
      
              // Helper to merge arrays of objects based on a unique key
              const mergeArrayByKey = <T, K extends keyof T>(original: T[], updates: T[] | undefined, key: K) => {
                  if (!updates) return;
                  updates.forEach(updateItem => {
                      const index = original.findIndex(originalItem => originalItem[key] === updateItem[key]);
                      if (index !== -1) {
                          // Update existing item by merging
                          original[index] = { ...original[index], ...updateItem };
                      } else {
                          // Add new item
                          original.push(updateItem);
                      }
                  });
              };
      
              // Perform merges for each part of the Bible
              mergeArrayByKey(newBible.characters, delta.characters_add_or_update, 'id');
              mergeArrayByKey(newBible.world.locations, delta.world_add_or_update?.locations, 'id');
              mergeArrayByKey(newBible.glossary, delta.glossary_add_or_update, 'term');
              mergeArrayByKey(newBible.timeline, delta.timeline_add_or_update, 't');
              
              updatedBible = newBible; // Capture the newly computed state
              return newBible;
          });
          
          return { accepted: true, updated_memory: updatedBible };
      },
      analyze_manuscript_for_bible: async () => {
          console.log(`Tool: analyze_manuscript_for_bible`);

          const biblePrompt = `You are a literary analyst AI. Your task is to read the provided manuscript and extract its core elements to build a "Story Bible". Analyze the text to identify characters, locations, glossary terms, and a timeline of events. For each item, provide a confidence score (0-100) and the text anchors (cXsYpZ:hash format, provided in the text) where the information was found.

Follow the JSON schema precisely.

MANUSCRIPT TEXT:
"""
${paragraphs.map((p, i) => `[c1s1p${i + 1}:${simpleHash(p)}] ${p}`).join('\n\n')}
"""`;
          
          const bibleSchema = {
              type: Type.OBJECT,
              properties: {
                  characters: {
                      type: Type.ARRAY,
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              id: { type: Type.STRING },
                              names: { type: Type.ARRAY, items: { type: Type.STRING } },
                              anchors: { type: Type.ARRAY, items: { type: Type.STRING } },
                              confidence: { type: Type.NUMBER },
                          },
                          required: ['id', 'names', 'anchors', 'confidence'],
                      },
                  },
                  world: {
                      type: Type.OBJECT,
                      properties: {
                          locations: {
                              type: Type.ARRAY,
                              items: {
                                  type: Type.OBJECT,
                                  properties: {
                                      id: { type: Type.STRING },
                                      desc: { type: Type.STRING },
                                      anchors: { type: Type.ARRAY, items: { type: Type.STRING } },
                                      confidence: { type: Type.NUMBER },
                                  },
                                  required: ['id', 'desc', 'anchors', 'confidence'],
                              },
                          },
                      },
                  },
                  glossary: {
                      type: Type.ARRAY,
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              term: { type: Type.STRING },
                              traits: { type: Type.ARRAY, items: { type: Type.STRING } },
                              anchors: { type: Type.ARRAY, items: { type: Type.STRING } },
                              confidence: { type: Type.NUMBER },
                          },
                          required: ['term', 'traits', 'anchors', 'confidence'],
                      },
                  },
                  timeline: {
                      type: Type.ARRAY,
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              t: { type: Type.STRING },
                              event: { type: Type.STRING },
                              anchors: { type: Type.ARRAY, items: { type: Type.STRING } },
                          },
                          required: ['t', 'event', 'anchors'],
                      },
                  },
              },
          };

          try {
              const result = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: biblePrompt,
                  config: {
                      responseMimeType: "application/json",
                      responseSchema: bibleSchema,
                  },
              });

              const extractedBible = JSON.parse(result.text) as Bible;
              setBible(extractedBible);
              return { success: true, summary: `Successfully analyzed the manuscript and built the story bible with ${extractedBible.characters.length} characters and ${extractedBible.world.locations.length} locations.` };
          } catch(e) {
              console.error("Error in analyze_manuscript_for_bible tool:", e);
              return { success: false, error: "Failed to analyze the manuscript." };
          }
      }
  };


  // Undo/Redo system
  const addToUndoStack = (action: UndoAction) => {
    setUndoStack(prev => [...prev, action]);
    setRedoStack([]); // Clear redo stack when new action is performed
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    
    const lastAction = undoStack[undoStack.length - 1];
    setManuscriptText(lastAction.before);
    
    // Move action to redo stack
    setRedoStack(prev => [...prev, lastAction]);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    
    const lastRedo = redoStack[redoStack.length - 1];
    setManuscriptText(lastRedo.after);
    
    // Move action back to undo stack
    setUndoStack(prev => [...prev, lastRedo]);
    setRedoStack(prev => prev.slice(0, -1));
  };

  const handleZoomIn = () => {
    setFontSize(prev => Math.min(prev + 2, 32));
  };

  const handleZoomOut = () => {
    setFontSize(prev => Math.max(prev - 2, 10));
  };

  const debouncedSummarizeAndSave = useMemo(
    () =>
      debounce(async (newText: string, oldText: string) => {
        if (newText === oldText) return;
        const summary = await generateChangeSummary(oldText, newText);
        addHistoryEntry(newText, summary, 'manual');
      }, 2500),
    []
  );

  const handleTextChange = (newText: string) => {
    const oldText = manuscriptText;
    setManuscriptText(newText);
    
    // Add to undo stack for manual edits
    if (oldText !== newText) {
      addToUndoStack({
        type: 'text_change',
        before: oldText,
        after: newText,
        timestamp: new Date(),
        description: 'Manual edit'
      });
    }
    
    debouncedSummarizeAndSave(newText, oldText);
  };

  const handleRevertToHistory = (id: number) => {
    const historyEntry = historyStack.find(entry => entry.id === id);
    if (historyEntry) {
        const description = `Reverted to: "${historyEntry.description.substring(0, 25)}..."`;
        updateManuscriptAndHistory(historyEntry.text, description, 'revert');
    }
  };

  const handleSendMessage = async (messageText: string) => {
    setIsChatLoading(true);
    setError(null);

    const userMessage: ChatMessageData = {
      id: `user-${Date.now()}`,
      sender: 'user', name: 'Author', avatar: 'A', text: messageText,
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    
    const messageWithContext = `(Editing range: ${editRange}) ${messageText}`;
    
    try {
        let response = await chat.sendMessage({ message: messageWithContext });

        while (response.functionCalls && response.functionCalls.length > 0) {
            const functionCalls = response.functionCalls;
            const toolResponses = [];

            for (const call of functionCalls) {
                const startTime = performance.now();
                const toolName = call.name as keyof typeof toolImplementations;
                if (toolImplementations[toolName]) {
                    const result = await toolImplementations[toolName](call.args as any);
                    toolResponses.push({ name: call.name, response: result });
                } else {
                     toolResponses.push({ name: call.name, response: { error: 'Unknown tool' } });
                }
                const endTime = performance.now();
                setPerformanceLog(prev => [...prev, { id: Date.now(), timestamp: new Date(), tool: toolName, duration: endTime - startTime }]);
            }
            
            response = await chat.sendMessage({
                message: toolResponses.map(r => ({ functionResponse: r }))
            });
        }
        
        const agentMessage: ChatMessageData = {
            id: `agent-${Date.now()}`,
            sender: 'agent', name: 'TextFlow', avatar: 'BC', text: response.text,
        };
        setChatMessages(prev => [...prev, agentMessage]);

    } catch (e: any) {
        const errorMsg = "Sorry, I encountered an error. Please try again.";
        setError(errorMsg);
        const agentMessage: ChatMessageData = {
            id: `agent-${Date.now()}`, sender: 'agent', name: 'TextFlow', avatar: 'BC', text: errorMsg,
        };
        setChatMessages(prev => [...prev, agentMessage]);
        console.error(e);
    } finally {
        setIsChatLoading(false);
    }
  };

  const handleRunPipeline = async () => {
    setIsPipelineLoading(true);
    setError(null);
    setAnnotations([]);
    setPipelineProgress(0);

    let progressInterval: number | undefined;
    progressInterval = window.setInterval(() => {
        setPipelineProgress(prev => {
            if (prev >= 95) {
                if (progressInterval) clearInterval(progressInterval);
                return prev;
            }
            return prev + 5;
        });
    }, 200);

    const annotationSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            originalText: { type: Type.STRING },
            suggestedChange: { type: Type.STRING },
            confidence: { type: Type.INTEGER },
          },
          required: ["category", "reasoning", "originalText", "suggestedChange", "confidence"]
        },
    };

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Analyze the following manuscript text for grammatical errors, stylistic issues, and awkward phrasing. For each suggestion, you MUST provide the exact original text to be replaced and the suggested change. Text: "${manuscriptText}"`,
            config: {
                responseMimeType: "application/json",
                responseSchema: annotationSchema,
            },
        });

        const parsedAnnotations = JSON.parse(response.text) as Omit<Annotation, 'id'>[];
        const newAnnotations = parsedAnnotations.map((ann, index) => ({
            ...ann, id: Date.now() + index,
        }));
        setAnnotations(newAnnotations);
    } catch(e) {
        setError("Failed to run annotation pipeline. The model may have returned an invalid response.");
        console.error(e);
    } finally {
        if(progressInterval) clearInterval(progressInterval);
        setPipelineProgress(100);
        setTimeout(() => {
            setIsPipelineLoading(false);
            setPipelineProgress(0);
        }, 500);
    }
  };

  const handleAcceptAnnotation = (annotationToAccept: Annotation) => {
    const newText = manuscriptText.replace(annotationToAccept.originalText, annotationToAccept.suggestedChange);
    const description = `Accepted suggestion for "${annotationToAccept.originalText.substring(0, 25)}..."`;
    updateManuscriptAndHistory(newText, description, 'suggestion');
    setAnnotations(prev => prev.filter(a => a.id !== annotationToAccept.id));
  };

  const handleRejectAnnotation = (id: number) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  };
  
  const handleRejectAllAnnotations = () => {
      setAnnotations([]);
  };
  
  const handleAcceptAllAnnotations = () => {
    const updatedText = annotations.reduce((currentText, ann) => {
      return currentText.replace(ann.originalText, ann.suggestedChange);
    }, manuscriptText);
    
    updateManuscriptAndHistory(updatedText, `Applied ${annotations.length} suggestions`, 'suggestion');
    setAnnotations([]);
  };

  const handleSaveMetadata = (newMetadata: Metadata) => {
    setMetadata(newMetadata);
  };

  const handleSaveRules = (newRules: ManuscriptRules) => {
    setManuscriptRules(newRules);
  };

  const handleUpdateContext = (newContext: AIContext) => {
    setAiContext(newContext);
  };

  const handleNavigateToSearchResult = (paragraphIndex: number) => {
    // Scroll to the paragraph in the editor
    if (editorRef.current) {
      editorRef.current.scrollToLine(paragraphIndex);
    }
    setHighlightedParaIndex(paragraphIndex);
    
    // Clear highlight after 3 seconds
    setTimeout(() => {
      setHighlightedParaIndex(null);
    }, 3000);
  };

  const handleTextImport = (newText: string) => {
    updateManuscriptAndHistory(newText, 'Imported new document', 'import');
    setAnnotations([]);
  };

  const handleExportProject = () => {
    const projectData = {
      manuscriptText,
      historyStack,
      metadata,
      bible,
      manuscriptRules,
      aiContext,
      performanceLog,
      pendingPatches,
      chatMessages,
      version: '1.0',
      exportDate: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_project_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportProject = (data: any) => {
    if (!data || typeof data !== 'object') {
      alert('Invalid project file format');
      return;
    }
    
    if (confirm('Importing a project will replace all current data. Are you sure you want to continue?')) {
      try {
        // Restore all state from imported data
        if (data.manuscriptText) setManuscriptText(data.manuscriptText);
        if (data.metadata) setMetadata(data.metadata);
        if (data.bible) setBible(data.bible);
        if (data.manuscriptRules) setManuscriptRules(data.manuscriptRules);
        if (data.aiContext) setAiContext(data.aiContext);
        if (data.performanceLog) {
          const restoredLog = data.performanceLog.map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp)
          }));
          setPerformanceLog(restoredLog);
        }
        if (data.pendingPatches) setPendingPatches(data.pendingPatches);
        if (data.chatMessages) setChatMessages(data.chatMessages);
        if (data.historyStack) {
          const restoredHistory = data.historyStack.map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp)
          }));
          setHistoryStack(restoredHistory);
        }
        
        setAnnotations([]);
        setSelectedPatchId(null);
        alert('Project imported successfully!');
      } catch (err) {
        console.error('Import error:', err);
        alert('Failed to import project. Some data may be corrupted.');
      }
    }
  };

  const handleClearChatHistory = () => {
    if (confirm('Are you sure you want to clear the chat history? This cannot be undone.')) {
      setChatMessages([
        { id: 'init-1', sender: 'agent', name: 'TextFlow', avatar: 'BC', text: 'Hello! I am the TextFlow agent. Describe the edits you need for your manuscript, and I will create a plan to execute them.' },
      ]);
    }
  };

  const handleInlineEditSubmit = async (instruction: string) => {
    if (!inlineEditSelection) return;
    
    setIsInlineEditLoading(true);
    setIsStreaming(true);
    setStreamingText('');
    setError(null);

    // Create abort controller for cancellation
    streamingAbortController.current = new AbortController();

    try {
        const prompt = `You are an expert editor. The user has selected the following text and wants to edit it:

SELECTED TEXT:
"""
${inlineEditSelection.text}
"""

USER INSTRUCTION: ${instruction}

Please provide ONLY the edited version of the text. Do not include explanations, quotes, or any other text. Just return the edited text that will replace the selection.`;

        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.3,
                topK: 1,
            }
        });

        let accumulatedText = '';
        
        // Process streaming chunks
        for await (const chunk of stream) {
            if (streamingAbortController.current?.signal.aborted) {
                throw new Error('Streaming cancelled');
            }
            
            const chunkText = chunk.text || '';
            accumulatedText += chunkText;
            setStreamingText(accumulatedText);
            
            // Show real-time preview in editor
            const previewText = manuscriptText.substring(0, inlineEditSelection.start) + 
                               accumulatedText + 
                               manuscriptText.substring(inlineEditSelection.end);
            setManuscriptText(previewText);
        }

        const editedText = accumulatedText.trim();
        
        // Final update with history
        const newText = manuscriptText.substring(0, inlineEditSelection.start) + 
                       editedText + 
                       manuscriptText.substring(inlineEditSelection.end);
        
        const description = `Inline edit: "${instruction.substring(0, 30)}${instruction.length > 30 ? '...' : ''}"`;
        updateManuscriptAndHistory(newText, description, 'ai');
        
        setInlineEditVisible(false);
        setInlineEditSelection(null);
    } catch (e: any) {
        if (e.message === 'Streaming cancelled') {
            console.log('Streaming cancelled by user');
            // Revert to original text
            const originalText = manuscriptText.substring(0, inlineEditSelection.start) + 
                                inlineEditSelection.text + 
                                manuscriptText.substring(inlineEditSelection.end);
            setManuscriptText(originalText);
        } else {
            console.error('Inline edit error:', e);
            setError('Failed to apply inline edit. Please try again.');
        }
    } finally {
        setIsInlineEditLoading(false);
        setIsStreaming(false);
        setStreamingText('');
        streamingAbortController.current = null;
    }
  };

  const handleSelectionChange = (selection: { start: number; end: number; text: string }) => {
    setInlineEditSelection(selection);
  };

  const handleOpenInlineEdit = () => {
    const selection = editorRef.current?.getSelection();
    if (selection) {
        setInlineEditSelection(selection);
        setInlineEditVisible(true);
    }
  };

  const handleCancelStreaming = () => {
    if (streamingAbortController.current) {
        streamingAbortController.current.abort();
    }
  };

  // Command Palette commands
  const commands: Command[] = useMemo(() => [
    // Editor commands
    { id: 'inline-edit', label: 'Inline Edit', description: 'Quick edit selected text', shortcut: 'Cmd+I', category: 'Editor', action: handleOpenInlineEdit },
    { id: 'undo', label: 'Undo', description: 'Undo last change', shortcut: 'Cmd+Z', category: 'Editor', action: handleUndo },
    { id: 'redo', label: 'Redo', description: 'Redo last undone change', shortcut: 'Cmd+Shift+Z', category: 'Editor', action: handleRedo },
    
    // Pipeline commands
    { id: 'run-pipeline', label: 'Run Proofreading Pipeline', description: 'Generate AI proofreading suggestions', shortcut: 'Cmd+R', category: 'AI', action: handleRunPipeline },
    { id: 'accept-all', label: 'Accept All Annotations', description: 'Apply all suggestions', shortcut: '', category: 'AI', action: handleAcceptAllAnnotations },
    { id: 'reject-all', label: 'Reject All Annotations', description: 'Discard all suggestions', shortcut: '', category: 'AI', action: handleRejectAllAnnotations },
    
    // History commands
    { id: 'revert', label: 'Revert to Version', description: 'Revert to previous version', shortcut: 'U', category: 'History', action: () => {
        if (historyStack.length >= 2) {
            const entryToRevertTo = historyStack[historyStack.length - 2];
            handleRevertToHistory(entryToRevertTo.id);
        }
    }},
    
    // Chat commands
    { id: 'clear-chat', label: 'Clear Chat History', description: 'Delete all chat messages', shortcut: '', category: 'Chat', action: handleClearChatHistory },
    
    // Range commands
    { id: 'range-selection', label: 'Set Range: Selection', description: 'Edit selected text only', shortcut: '', category: 'Range', action: () => setEditRange('selection') },
    { id: 'range-scene', label: 'Set Range: Scene', description: 'Edit current scene', shortcut: '', category: 'Range', action: () => setEditRange('scene') },
    { id: 'range-chapter', label: 'Set Range: Chapter', description: 'Edit current chapter', shortcut: '', category: 'Range', action: () => setEditRange('chapter') },
    { id: 'range-book', label: 'Set Range: Book', description: 'Edit entire book', shortcut: '', category: 'Range', action: () => setEditRange('book') },
  ], [historyStack, undoStack, redoStack]);

  const handleSelectPatch = (id: string) => {
    setSelectedPatchId(id);
    const patch = pendingPatches.find(p => p.patch_id === id);
    if (patch) {
      console.log('Setting highlighted text from patch:', patch.before_excerpt.substring(0, 100));
      setHighlightedText(patch.before_excerpt);
      // Trigger search even if same patch is clicked again
      setSearchTrigger(prev => prev + 1);
    }
  };

  const handleUpdatePatch = (id: string, newAfter: string, newBefore?: string) => {
      setPendingPatches(patches => patches.map(p => {
          if (p.patch_id === id) {
              const updates: Partial<Patch> = { after_proposed: newAfter };
              if (newBefore !== undefined) {
                  updates.before_excerpt = newBefore;
              }
              return { ...p, ...updates };
          }
          return p;
      }));
  };

  // Find best matching text in paragraph using fuzzy matching
  const findBestMatch = (paragraph: string, searchText: string, threshold: number = 0.7): { text: string; score: number; index: number } | null => {
      const searchLen = searchText.length;
      let bestMatch = { text: '', score: 0, index: -1 };
      
      // Try exact match first
      const exactIndex = paragraph.indexOf(searchText);
      if (exactIndex !== -1) {
          return { text: searchText, score: 1.0, index: exactIndex };
      }
      
      // Try sliding window with similarity check
      for (let i = 0; i <= paragraph.length - searchLen; i++) {
          const candidate = paragraph.substring(i, i + searchLen);
          const similarity = calculateSimilarity(candidate, searchText);
          
          if (similarity > bestMatch.score) {
              bestMatch = { text: candidate, score: similarity, index: i };
          }
      }
      
      return bestMatch.score >= threshold ? bestMatch : null;
  };

  // Simple similarity calculation (Levenshtein-based)
  const calculateSimilarity = (str1: string, str2: string): number => {
      const len1 = str1.length;
      const len2 = str2.length;
      const matrix: number[][] = [];
      
      for (let i = 0; i <= len1; i++) {
          matrix[i] = [i];
      }
      for (let j = 0; j <= len2; j++) {
          matrix[0][j] = j;
      }
      
      for (let i = 1; i <= len1; i++) {
          for (let j = 1; j <= len2; j++) {
              const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
              matrix[i][j] = Math.min(
                  matrix[i - 1][j] + 1,
                  matrix[i][j - 1] + 1,
                  matrix[i - 1][j - 1] + cost
              );
          }
      }
      
      const distance = matrix[len1][len2];
      const maxLen = Math.max(len1, len2);
      return 1 - distance / maxLen;
  };

  const handleSkipPatch = (id: string) => {
      setPendingPatches(patches => {
          const currentIndex = patches.findIndex(p => p.patch_id === id);
          const remaining = patches.filter(p => p.patch_id !== id);
          
          if (remaining.length > 0) {
              const nextIndex = Math.min(currentIndex, remaining.length - 1);
              setSelectedPatchId(remaining[nextIndex].patch_id);
              setHighlightedText(remaining[nextIndex].before_excerpt);
          } else {
              setSelectedPatchId(null);
              setHighlightedText(undefined);
          }
          return remaining;
      });
      setSearchTrigger(prev => prev + 1);
  };

  const handleAcceptPatch = (patch: Patch) => {
      if (!patch.target?.anchor) {
          setError(`Invalid patch: missing target anchor.`);
          handleSkipPatch(patch.patch_id);
          return;
      }

      const afterText = Array.isArray(patch.after_proposed) ? patch.after_proposed[0] : patch.after_proposed;
      
      let targetIndex = -1;
      let foundMatch = null;
      
      // Strategy 1: FIRST try exact text search across ALL paragraphs
      console.log(`🔍 Searching for exact match: "${patch.before_excerpt.substring(0, 50)}..."`);
      for (let i = 0; i < paragraphs.length; i++) {
          if (paragraphs[i].includes(patch.before_excerpt)) {
              targetIndex = i;
              foundMatch = patch.before_excerpt;
              console.log(`✓ Found exact match in paragraph ${i + 1}`);
              break;
          }
      }
      
      // Strategy 2: Try by hash (only if no exact match)
      if (targetIndex === -1) {
          const hash = patch.target.anchor.split(':')[1];
          const hashIndex = paragraphs.findIndex(p => simpleHash(p) === hash);
          if (hashIndex !== -1) {
              targetIndex = hashIndex;
              console.log(`✓ Found by hash in paragraph ${hashIndex + 1}`);
          }
      }
      
      // Strategy 3: Try by paragraph number (only if no exact match or hash)
      if (targetIndex === -1) {
          const match = patch.target.anchor.match(/p(\d+):/);
          if (match) {
              const paraNum = parseInt(match[1], 10) - 1;
              if (paraNum >= 0 && paraNum < paragraphs.length) {
                  targetIndex = paraNum;
                  console.log(`✓ Using paragraph number ${paraNum + 1}`);
              }
          }
      }
      
      // Strategy 4: Fuzzy search across ALL paragraphs
      if (targetIndex === -1 || !foundMatch) {
          console.log(`🔍 Performing fuzzy search across all paragraphs...`);
          let bestGlobalMatch = null;
          let bestGlobalIndex = -1;
          
          for (let i = 0; i < paragraphs.length; i++) {
              const match = findBestMatch(paragraphs[i], patch.before_excerpt, 0.4);
              if (match && (!bestGlobalMatch || match.score > bestGlobalMatch.score)) {
                  bestGlobalMatch = match;
                  bestGlobalIndex = i;
              }
          }
          
          if (bestGlobalMatch && bestGlobalMatch.score >= 0.5) {
              targetIndex = bestGlobalIndex;
              foundMatch = bestGlobalMatch.text;
              console.log(`✓ Found fuzzy match (${Math.round(bestGlobalMatch.score * 100)}%) in paragraph ${bestGlobalIndex + 1}`);
              console.log(`   Expected: "${patch.before_excerpt.substring(0, 60)}..."`);
              console.log(`   Found: "${bestGlobalMatch.text.substring(0, 60)}..."`);
          }
      }

      if (targetIndex >= 0 && targetIndex < paragraphs.length) {
          const originalPara = paragraphs[targetIndex];
          const textToReplace = foundMatch || patch.before_excerpt;
          
          // Apply the patch
          if (originalPara.includes(textToReplace)) {
              const matchType = foundMatch && foundMatch !== patch.before_excerpt ? 'fuzzy' : 'exact';
              const newPara = originalPara.replace(textToReplace, afterText);
              const newParagraphs = [...paragraphs];
              newParagraphs[targetIndex] = newPara;
              const newText = newParagraphs.join('\n\n');
              const description = matchType === 'fuzzy' 
                  ? `Applied patch (fuzzy): ${patch.rationale?.goal || 'Unknown goal'}`
                  : `Applied patch: ${patch.rationale?.goal || 'Unknown goal'}`;
              
              console.log(`✅ Applying patch to paragraph ${targetIndex + 1} (${matchType} match)`);
              
              // IMMEDIATELY sync all remaining patches BEFORE updating manuscript
              console.log('🔄 Syncing remaining patches to new text version...');
              const remainingPatches = pendingPatches.filter(p => p.patch_id !== patch.patch_id);
              const updatedPatches = remainingPatches.map(p => {
                  if (!p?.target?.anchor) return p;
                  
                  // Find target in NEW paragraphs - search by text first
                  let idx = -1;
                  
                  // Try to find by exact text match first
                  for (let i = 0; i < newParagraphs.length; i++) {
                      if (newParagraphs[i].includes(p.before_excerpt)) {
                          idx = i;
                          break;
                      }
                  }
                  
                  // Fallback to paragraph number
                  if (idx === -1) {
                      const match = p.target.anchor.match(/p(\d+):/);
                      if (match) {
                          idx = parseInt(match[1], 10) - 1;
                      }
                  }
                  
                  if (idx >= 0 && idx < newParagraphs.length) {
                      const currentPara = newParagraphs[idx];
                      const newHash = simpleHash(currentPara);
                      
                      // Find best match for before_excerpt in the new paragraph
                      let newBeforeExcerpt = p.before_excerpt;
                      if (!currentPara.includes(p.before_excerpt)) {
                          const bestMatch = findBestMatch(currentPara, p.before_excerpt, 0.4);
                          if (bestMatch && bestMatch.score >= 0.5) {
                              newBeforeExcerpt = bestMatch.text;
                          }
                      }
                      
                      return {
                          ...p,
                          target: {
                              ...p.target,
                              para: idx + 1,
                              anchor: `p${idx + 1}:${newHash}`
                          },
                          before_excerpt: newBeforeExcerpt
                      };
                  }
                  return p;
              });
              
              // Update patches FIRST, then manuscript
              setPendingPatches(updatedPatches);
              updateManuscriptAndHistory(newText, description, 'ai');
              
              // Select next patch
              if (updatedPatches.length > 0) {
                  setSelectedPatchId(updatedPatches[0].patch_id);
                  setHighlightedText(updatedPatches[0].before_excerpt);
              } else {
                  setSelectedPatchId(null);
                  setHighlightedText(undefined);
              }
              
              // Trigger search after state updates
              setTimeout(() => setSearchTrigger(prev => prev + 1), 100);
          } else {
              // Should not happen since we already found a match, but just in case
              console.error('❌ Found target paragraph but text not found in it');
              const excerpt = patch.before_excerpt.substring(0, 50);
              const paraPreview = originalPara.substring(0, 100);
              setError(`Could not apply patch. Expected: "${excerpt}..." | Found paragraph: "${paraPreview}...". Click Skip.`);
          }
      } else {
          console.error('❌ Could not find target paragraph');
          const excerpt = patch.before_excerpt.substring(0, 50);
          setError(`Could not find paragraph containing: "${excerpt}...". This patch may be outdated. Click Skip.`);
      }
  };

  // Sync patch's before_excerpt with current paragraph text
  const handleSyncPatchBefore = (patchId: string) => {
      const patch = pendingPatches.find(p => p.patch_id === patchId);
      if (!patch?.target?.anchor) return;

      const hash = patch.target.anchor.split(':')[1];
      let targetIndex = paragraphs.findIndex(p => simpleHash(p) === hash);
      
      if (targetIndex === -1) {
          const match = patch.target.anchor.match(/p(\d+):/);
          if (match) {
              targetIndex = parseInt(match[1], 10) - 1;
          }
      }

      if (targetIndex >= 0 && targetIndex < paragraphs.length) {
          const currentPara = paragraphs[targetIndex];
          const afterText = Array.isArray(patch.after_proposed) ? patch.after_proposed[0] : patch.after_proposed;
          
          // Update the before_excerpt to match current paragraph
          handleUpdatePatch(patchId, afterText, currentPara);
          setError(null);
      }
  };

  // Sync all remaining patches with the updated manuscript text
  const syncAllPatches = (updatedParagraphs: string[], excludePatchId?: string) => {
      const patchesToSync = pendingPatches.filter(p => p.patch_id !== excludePatchId);
      
      console.log(`🔄 Syncing ${patchesToSync.length} patches with updated manuscript...`);
      
      setPendingPatches(patches => patches.map(patch => {
          if (patch.patch_id === excludePatchId || !patch?.target?.anchor) {
              return patch;
          }

          // First try to find by paragraph number (more reliable after edits)
          const match = patch.target.anchor.match(/p(\d+):/);
          let targetIndex = -1;
          
          if (match) {
              targetIndex = parseInt(match[1], 10) - 1;
          }
          
          // Fallback to hash-based search
          if (targetIndex === -1 || targetIndex >= updatedParagraphs.length) {
              const hash = patch.target.anchor.split(':')[1];
              targetIndex = updatedParagraphs.findIndex(p => simpleHash(p) === hash);
          }

          if (targetIndex >= 0 && targetIndex < updatedParagraphs.length) {
              const currentPara = updatedParagraphs[targetIndex];
              const newHash = simpleHash(currentPara);
              const afterText = Array.isArray(patch.after_proposed) ? patch.after_proposed[0] : patch.after_proposed;
              
              // Try to find the before_excerpt in the current paragraph
              let newBeforeExcerpt = patch.before_excerpt;
              let syncStatus = 'exact match';
              
              if (!currentPara.includes(patch.before_excerpt)) {
                  // If exact match not found, try to find similar text
                  const bestMatch = findBestMatch(currentPara, patch.before_excerpt, 0.6);
                  if (bestMatch && bestMatch.score >= 0.6) {
                      newBeforeExcerpt = bestMatch.text;
                      syncStatus = `fuzzy match (${Math.round(bestMatch.score * 100)}%)`;
                  } else {
                      syncStatus = 'no match found';
                      console.warn(`⚠️  Could not find suitable match for patch ${patch.patch_id} in paragraph ${targetIndex + 1}`);
                  }
              }
              
              console.log(`  ✓ Patch ${patch.patch_id}: p${targetIndex + 1}, ${syncStatus}`);
              
              // Update the patch with new anchor hash and before_excerpt
              return {
                  ...patch,
                  target: {
                      ...patch.target,
                      para: targetIndex + 1,
                      anchor: `p${targetIndex + 1}:${newHash}`
                  },
                  before_excerpt: newBeforeExcerpt
              };
          }
          
          console.warn(`  ✗ Patch ${patch.patch_id}: target paragraph not found`);
          return patch;
      }));
  };

  // Wrapper function to sync all patches with current manuscript state
  const handleSyncAllPatches = () => {
      syncAllPatches(paragraphs);
      setError(null);
  };

  const selectedPatch = useMemo(() => {
      return pendingPatches.find(p => p.patch_id === selectedPatchId);
  }, [pendingPatches, selectedPatchId]);

  // Auto-select first patch if patches exist but none selected
  const isFirstAutoSelectRef = useRef(true);
  useEffect(() => {
    if (pendingPatches.length > 0 && !selectedPatchId) {
      setSelectedPatchId(pendingPatches[0].patch_id);
      setHighlightedText(pendingPatches[0].before_excerpt);
      if (isFirstAutoSelectRef.current) {
        isFirstAutoSelectRef.current = false;
        setTimeout(() => setSearchTrigger(prev => prev + 1), 300);
      }
    }
  }, [pendingPatches, selectedPatchId]);

  // Update highlighted text when selected patch changes
  useEffect(() => {
    if (selectedPatch) {
      setHighlightedText(selectedPatch.before_excerpt);
      // Trigger search whenever patch changes
      setTimeout(() => setSearchTrigger(prev => prev + 1), 50);
    } else {
      setHighlightedText(undefined);
    }
  }, [selectedPatch]);

  // Use browser's native selection to highlight text in textarea
  useEffect(() => {
    if (highlightedText && selectedPatchId) {
      const searchText = highlightedText.trim();
      
      console.log('Searching for text in manuscript (trigger:', searchTrigger, '):', searchText.substring(0, 50));
      
      setTimeout(() => {
        const textarea = document.querySelector('.editable-textarea') as HTMLTextAreaElement;
        if (textarea) {
          // Find the text in manuscript
          let textIndex = manuscriptText.indexOf(searchText);
          
          // If not found with full text, try with first significant line
          if (textIndex === -1) {
            const lines = searchText.split('\n');
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine.length >= 20) {
                textIndex = manuscriptText.indexOf(trimmedLine);
                if (textIndex !== -1) {
                  console.log('Found by line:', trimmedLine.substring(0, 50));
                  break;
                }
              }
            }
          }
          
          if (textIndex !== -1) {
            const endIndex = textIndex + searchText.length;
            
            // Focus and select the text in textarea
            textarea.focus();
            textarea.setSelectionRange(textIndex, endIndex);
            
            // Scroll to the selection
            const linesBefore = manuscriptText.substring(0, textIndex).split('\n').length - 1;
            editorRef.current?.scrollToLine(Math.max(0, linesBefore - 2));
            
            console.log('Selected text at position', textIndex, '-', endIndex);
          } else {
            console.warn('Could not find text in manuscript:', searchText.substring(0, 100));
          }
        }
      }, 200);
    } else {
      // Clear selection when no patch is selected
      const textarea = document.querySelector('.editable-textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.setSelectionRange(0, 0);
      }
    }
  }, [highlightedText, selectedPatchId, searchTrigger, manuscriptText]);

  // Auto-reindex patches when manuscript text changes (DISABLED - using manual sync after patch apply)
  // Keeping this commented out to avoid conflicts with manual synchronization
  /*
  const lastSyncedTextRef = useRef<string>('');
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (pendingPatches.length > 0 && manuscriptText !== lastSyncedTextRef.current) {
      const previousText = lastSyncedTextRef.current;
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      const charDiff = Math.abs(manuscriptText.length - previousText.length);
      if (charDiff > 50 || previousText === '') {
        lastSyncedTextRef.current = manuscriptText;
        syncAllPatches(paragraphs);
      } else {
        syncTimeoutRef.current = setTimeout(() => {
          lastSyncedTextRef.current = manuscriptText;
          syncAllPatches(paragraphs);
        }, 300);
      }
    }
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [manuscriptText, pendingPatches.length]);
  */

  useEffect(() => {
    if (selectedPatch && selectedPatch.target?.anchor) {
        let targetParaIndex = -1;
        let textToHighlight = selectedPatch.before_excerpt;
        
        // Strategy 1: FIRST try exact text search across ALL paragraphs (same as apply logic)
        for (let i = 0; i < paragraphs.length; i++) {
            if (paragraphs[i].includes(selectedPatch.before_excerpt)) {
                targetParaIndex = i;
                textToHighlight = selectedPatch.before_excerpt;
                console.log(`📍 Highlighting exact match in paragraph ${i + 1}`);
                break;
            }
        }
        
        // Strategy 2: Try by hash
        if (targetParaIndex === -1) {
            const hash = selectedPatch.target.anchor.split(':')[1];
            targetParaIndex = paragraphs.findIndex(p => simpleHash(p) === hash);
            if (targetParaIndex !== -1) {
                console.log(`📍 Found by hash, paragraph ${targetParaIndex + 1}`);
            }
        }
        
        // Strategy 3: Try by paragraph number
        if (targetParaIndex === -1) {
            const match = selectedPatch.target.anchor.match(/p(\d+):/);
            if (match) {
                const paraNum = parseInt(match[1], 10) - 1;
                if (paraNum >= 0 && paraNum < paragraphs.length) {
                    targetParaIndex = paraNum;
                    console.log(`📍 Using paragraph number ${paraNum + 1}`);
                }
            }
        }
        
        // Strategy 4: Fuzzy search across ALL paragraphs
        if (targetParaIndex === -1) {
            let bestGlobalMatch = null;
            let bestGlobalIndex = -1;
            
            for (let i = 0; i < paragraphs.length; i++) {
                const match = findBestMatch(paragraphs[i], selectedPatch.before_excerpt, 0.4);
                if (match && (!bestGlobalMatch || match.score > bestGlobalMatch.score)) {
                    bestGlobalMatch = match;
                    bestGlobalIndex = i;
                }
            }
            
            if (bestGlobalMatch && bestGlobalMatch.score >= 0.5) {
                targetParaIndex = bestGlobalIndex;
                textToHighlight = bestGlobalMatch.text;
                console.log(`📍 Highlighting fuzzy match (${Math.round(bestGlobalMatch.score * 100)}%) in paragraph ${bestGlobalIndex + 1}`);
            }
        }
        
        // If we found target but don't have exact match, try fuzzy in that paragraph
        if (targetParaIndex !== -1 && targetParaIndex < paragraphs.length) {
            const currentPara = paragraphs[targetParaIndex];
            
            if (!currentPara.includes(selectedPatch.before_excerpt)) {
                // Try to find the best match in this specific paragraph
                const bestMatch = findBestMatch(currentPara, selectedPatch.before_excerpt, 0.4);
                if (bestMatch && bestMatch.score >= 0.5) {
                    textToHighlight = bestMatch.text;
                    console.log(`📍 Highlighting fuzzy match (${Math.round(bestMatch.score * 100)}%) in target paragraph ${targetParaIndex + 1}`);
                } else {
                    // No good match, highlight first 150 chars as fallback
                    textToHighlight = currentPara.substring(0, 150);
                    console.log(`📍 No match found, highlighting beginning of paragraph ${targetParaIndex + 1}`);
                }
            }
            
            setHighlightedParaIndex(targetParaIndex);
            setHighlightedText(textToHighlight);
            
            const targetLine = paragraphStartLines[targetParaIndex];
            if (targetLine !== undefined) {
                 editorRef.current?.scrollToLine(targetLine);
            }
        } else {
            console.log(`📍 Could not find target paragraph for highlighting`);
            setHighlightedParaIndex(null);
            setHighlightedText(undefined);
        }
    } else {
        setHighlightedParaIndex(null);
        setHighlightedText(undefined);
    }
  }, [selectedPatch, paragraphs, paragraphStartLines]);

  // Save state to localStorage whenever key data changes
  useEffect(() => {
    const stateToSave = {
      manuscriptText,
      historyStack,
      metadata,
      bible,
      manuscriptRules,
      aiContext,
      performanceLog,
      pendingPatches,
      selectedPatchId,
      chatMessages,
    };
    saveToLocalStorage(stateToSave);
  }, [manuscriptText, historyStack, metadata, bible, manuscriptRules, aiContext, performanceLog, pendingPatches, selectedPatchId, chatMessages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Esc to cancel streaming
        if (e.key === 'Escape' && isStreaming) {
            e.preventDefault();
            handleCancelStreaming();
            return;
        }

        // Cmd/Ctrl+Z for undo
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            handleUndo();
            return;
        }

        // Cmd/Ctrl+Shift+Z for redo
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
            e.preventDefault();
            handleRedo();
            return;
        }

        // Cmd/Ctrl+K for command palette
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            setCommandPaletteVisible(true);
            return;
        }

        // Cmd/Ctrl+I for inline edit
        if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
            e.preventDefault();
            handleOpenInlineEdit();
            return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
            e.preventDefault();
            if (!isPipelineLoading) {
                handleRunPipeline();
            }
            return;
        }

        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return; // Don't interfere with typing
        }
        
        const key = e.key.toLowerCase();

        if (pendingPatches.length > 0 && selectedPatch) {
            if (key === 'a') {
                e.preventDefault();
                handleAcceptPatch(selectedPatch);
            } else if (key === 's') {
                e.preventDefault();
                handleSkipPatch(selectedPatch.patch_id);
            } else if (key === 'e') {
                e.preventDefault();
                setIsPatchEditing(true);
            } else if (key === 'y') {
                // Sync Before with 'Y' key
                e.preventDefault();
                handleSyncPatchBefore(selectedPatch.patch_id);
            } else if (key === 'n') {
                e.preventDefault();
                const currentIndex = pendingPatches.findIndex(p => p.patch_id === selectedPatch.patch_id);
                const nextIndex = (currentIndex + 1) % pendingPatches.length;
                setSelectedPatchId(pendingPatches[nextIndex].patch_id);
            } else if (key === 'p') {
                // Previous patch
                e.preventDefault();
                const currentIndex = pendingPatches.findIndex(p => p.patch_id === selectedPatch.patch_id);
                const prevIndex = currentIndex === 0 ? pendingPatches.length - 1 : currentIndex - 1;
                setSelectedPatchId(pendingPatches[prevIndex].patch_id);
            }
        }
        
        if (key === 'u') {
             e.preventDefault();
             if (historyStack.length >= 2) {
                const entryToRevertTo = historyStack[historyStack.length - 2];
                handleRevertToHistory(entryToRevertTo.id);
             } else if (historyStack.length === 1) {
                 handleRevertToHistory(historyStack[0].id);
             }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pendingPatches, selectedPatch, isPipelineLoading, historyStack, isStreaming]);

  return (
    <div className="app-container">
      <ChatPanel 
        messages={chatMessages} 
        onSendMessage={handleSendMessage} 
        isLoading={isChatLoading} 
        onClearHistory={handleClearChatHistory}
      />
      <EditorPanel 
        text={manuscriptText} 
        onTextChange={handleTextChange}
        error={error}
        annotations={annotations}
        pendingPatches={pendingPatches}
        selectedPatch={selectedPatch}
        onSelectPatch={handleSelectPatch}
        onAcceptPatch={handleAcceptPatch}
        onSkipPatch={handleSkipPatch}
        editorRef={editorRef}
        highlightedParaIndex={highlightedParaIndex}
        highlightedText={highlightedText}
        onSelectionChange={handleSelectionChange}
        isStreaming={isStreaming}
        onCancelStreaming={handleCancelStreaming}
        fontSize={fontSize}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />
      <Sidebar 
        annotations={annotations} 
        manuscriptText={manuscriptText} 
        history={historyStack}
        metadata={metadata}
        bible={bible}
        manuscriptRules={manuscriptRules}
        aiContext={aiContext}
        performanceLog={performanceLog}
        onAcceptAnnotation={handleAcceptAnnotation}
        onRejectAnnotation={handleRejectAnnotation}
        onAcceptAll={handleAcceptAllAnnotations}
        onRejectAll={handleRejectAllAnnotations}
        onRevertToHistory={handleRevertToHistory}
        onRunPipeline={handleRunPipeline}
        isPipelineLoading={isPipelineLoading}
        pipelineProgress={pipelineProgress}
        onSaveMetadata={handleSaveMetadata}
        onSaveRules={handleSaveRules}
        onUpdateContext={handleUpdateContext}
        onNavigateToSearchResult={handleNavigateToSearchResult}
        onTextImport={handleTextImport}
        onExportProject={handleExportProject}
        onImportProject={handleImportProject}
        editRange={editRange}
        onEditRangeChange={setEditRange}
      />
      <InlineEditPopup
        visible={inlineEditVisible}
        selectedText={inlineEditSelection?.text || ''}
        onSubmit={handleInlineEditSubmit}
        onClose={() => setInlineEditVisible(false)}
        isLoading={isInlineEditLoading}
      />
      <CommandPalette
        visible={commandPaletteVisible}
        onClose={() => setCommandPaletteVisible(false)}
        commands={commands}
      />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}