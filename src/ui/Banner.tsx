import React from 'react';
import { Box, Text } from 'ink';
import { getTheme, getCurrentThemeName } from '../config/theme.js';

interface BannerProps {
  version: string;
  model: string;
  cwd: string;
  tip?: string;
}

const TIPS = [
  'Use @filename to mention and inject files into your prompt.',
  'Type !command to quickly run a shell command directly.',
  'Press Shift+Tab anytime to cycle permission modes (default → acceptEdits → plan).',
  'Type /help to see all available commands and shortcuts.',
  'Type /compact to compress conversation history and free up context window.',
  'Press Esc to interrupt generation, or Esc Esc to edit your previous message.',
  'Use #note to save a key insight directly into project memory (ANTROR.md).',
];

export const Banner: React.FC<BannerProps> = ({ version, model, cwd, tip }) => {
  const theme = getTheme();
  const selectedTip = tip || TIPS[Math.floor(Math.random() * TIPS.length)];

  // Pretty truncated cwd
  const displayCwd = cwd.length > 40 ? '...' + cwd.slice(-37) : cwd;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="#FF6B35" bold>
{`  ▄████████ █▄    █  ████████ █▀▀▀█ ▄████████
  ███    ███ ███▄  █     ██    ██▄▄█ ███    ███
  ███    ███ ██ ▀█ █     ██    ██▄▄▄ ███    ███
  ██████████ ██   ██     ██    ██  ██ ██████████`}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="row" gap={2}>
        <Text bold color="white">
          ANTROR Code <Text color="gray">v{version}</Text>
        </Text>
        <Text color="gray">|</Text>
        <Text color="cyan">{model}</Text>
        <Text color="gray">|</Text>
        <Text color="gray">{displayCwd}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">💡 <Text italic>{selectedTip}</Text></Text>
      </Box>
    </Box>
  );
};
