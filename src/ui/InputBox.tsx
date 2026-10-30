import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SLASH_COMMANDS = [
  '/help',
  '/settings',
  '/clear',
  '/compact',
  '/config',
  '/model',
  '/theme',
  '/init',
  '/memory',
  '/permissions',
  '/agents',
  '/mcp',
  '/hooks',
  '/review',
  '/resume',
  '/cost',
  '/status',
  '/doctor',
  '/login',
  '/logout',
  '/vim',
  '/export',
  '/bug',
  '/exit',
];

interface InputBoxProps {
  onSubmit: (value: string) => void;
  onInterrupt: () => void;
  onRewind: () => void;
  onCyclePermissionMode: () => void;
  onToggleExpand: () => void;
  isGenerating: boolean;
  history?: string[];
  slashCommands?: string[];
}

export const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  onInterrupt,
  onRewind,
  onCyclePermissionMode,
  onToggleExpand,
  isGenerating,
  history = [],
  slashCommands = DEFAULT_SLASH_COMMANDS,
}) => {
  const [value, setValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lastEscTime, setLastEscTime] = useState(0);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  // Autocomplete computation only when value changes
  useEffect(() => {
    if (value.startsWith('/')) {
      const match = slashCommands.filter(c => c.startsWith(value));
      setAutocompleteSuggestions(match);
      setSuggestionIndex(0);
    } else if (value.includes('@')) {
      const lastAt = value.lastIndexOf('@');
      const query = value.slice(lastAt + 1).toLowerCase();
      try {
        const files = fs.readdirSync(process.cwd());
        const matchedFiles = files
          .filter(f => !f.startsWith('.') && f.toLowerCase().includes(query))
          .slice(0, 5);
        setAutocompleteSuggestions(matchedFiles);
        setSuggestionIndex(0);
      } catch {
        setAutocompleteSuggestions([]);
      }
    } else {
      setAutocompleteSuggestions(prev => prev.length === 0 ? prev : []);
    }
  }, [value]);

  useInput((input, key) => {
    // Esc handling
    if (key.escape) {
      const now = Date.now();
      if (isGenerating) {
        onInterrupt();
      } else if (now - lastEscTime < 500) {
        // Esc Esc: rewind / edit previous message
        onRewind();
      }
      setLastEscTime(now);
      return;
    }

    // Ctrl+C handling
    if (key.ctrl && input === 'c') {
      if (value) {
        setValue('');
      } else {
        process.exit(0);
      }
      return;
    }

    // Ctrl+D handling
    if (key.ctrl && input === 'd') {
      process.exit(0);
      return;
    }

    // Ctrl+R: expand output
    if (key.ctrl && input === 'r') {
      onToggleExpand();
      return;
    }

    // Shift+Tab: cycle permission modes
    if (key.tab && key.shift) {
      onCyclePermissionMode();
      return;
    }

    // Tab autocomplete
    if (key.tab && !key.shift) {
      if (autocompleteSuggestions.length > 0) {
        const selected = autocompleteSuggestions[suggestionIndex];
        if (value.startsWith('/')) {
          setValue(selected + ' ');
        } else if (value.includes('@')) {
          const lastAt = value.lastIndexOf('@');
          setValue(value.slice(0, lastAt + 1) + selected + ' ');
        }
        setAutocompleteSuggestions([]);
      } else {
        onCyclePermissionMode();
      }
      return;
    }

    // Up Arrow: History backward
    if (key.upArrow) {
      if (history.length > 0) {
        const nextIdx = historyIndex + 1 < history.length ? historyIndex + 1 : historyIndex;
        setHistoryIndex(nextIdx);
        setValue(history[history.length - 1 - nextIdx] || '');
      }
      return;
    }

    // Down Arrow: History forward
    if (key.downArrow) {
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setValue(history[history.length - 1 - nextIdx] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setValue('');
      }
      return;
    }

    // Backspace / Delete
    if (key.backspace || key.delete) {
      setValue(prev => prev.slice(0, -1));
      return;
    }

    // Return / Enter
    if (key.return) {
      // Check for multi-line continuation with `\`
      if (value.endsWith('\\')) {
        setValue(prev => prev.slice(0, -1) + '\n');
        return;
      }

      if (value.trim()) {
        const toSubmit = value;
        setValue('');
        setHistoryIndex(-1);
        setAutocompleteSuggestions([]);
        onSubmit(toSubmit);
      }
      return;
    }

    // Normal typing
    if (input) {
      setValue(prev => prev + input);
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Suggestions popup */}
      {autocompleteSuggestions.length > 0 && (
        <Box flexDirection="row" gap={1} marginBottom={0} marginLeft={2}>
          <Text color="gray">Suggestions:</Text>
          {autocompleteSuggestions.slice(0, 4).map((s, idx) => (
            <Text key={idx} color={idx === suggestionIndex ? 'cyan' : 'gray'} bold={idx === suggestionIndex}>
              {s}
            </Text>
          ))}
        </Box>
      )}

      {/* Bordered rounded input box */}
      <Box
        borderStyle="round"
        borderColor="#FF6B35"
        paddingX={1}
        flexDirection="row"
        alignItems="center"
      >
        <Text color="#FF6B35" bold>
          {'> '}
        </Text>
        <Text color="white">
          {value}
          <Text color="#FF6B35">█</Text>
        </Text>
      </Box>
    </Box>
  );
};
