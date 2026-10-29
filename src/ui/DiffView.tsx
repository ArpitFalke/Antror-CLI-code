import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../config/theme.js';

interface DiffViewProps {
  patch: string;
  filePath: string;
  additions?: number;
  removals?: number;
}

interface DiffLine {
  type: 'header' | 'hunk' | 'add' | 'remove' | 'context';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export function parsePatch(patch: string): DiffLine[] {
  const lines = patch.split('\n');
  const result: DiffLine[] = [];

  let currentOld = 0;
  let currentNew = 0;

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('Index:') || line.startsWith('===')) {
      result.push({ type: 'header', text: line });
      continue;
    }

    if (line.startsWith('@@')) {
      // Hunk header e.g. @@ -1,5 +1,6 @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentOld = parseInt(match[1], 10);
        currentNew = parseInt(match[2], 10);
      }
      result.push({ type: 'hunk', text: line });
      continue;
    }

    if (line.startsWith('+')) {
      result.push({
        type: 'add',
        text: line.slice(1),
        newLineNumber: currentNew++,
      });
    } else if (line.startsWith('-')) {
      result.push({
        type: 'remove',
        text: line.slice(1),
        oldLineNumber: currentOld++,
      });
    } else if (line.startsWith(' ')) {
      result.push({
        type: 'context',
        text: line.slice(1),
        oldLineNumber: currentOld++,
        newLineNumber: currentNew++,
      });
    }
  }

  return result;
}

export const DiffView: React.FC<DiffViewProps> = ({
  patch,
  filePath,
  additions = 0,
  removals = 0,
}) => {
  const parsedLines = parsePatch(patch);

  // Limit rendering to 50 lines to keep terminal snappy
  const maxRender = 40;
  const displayed = parsedLines.slice(0, maxRender);
  const remaining = parsedLines.length - maxRender;

  return (
    <Box flexDirection="column" marginY={1} borderStyle="round" borderColor="gray" paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          Update({filePath})
        </Text>
        <Text color="gray">
          <Text color="green">+{additions}</Text> <Text color="red">-{removals}</Text>
        </Text>
      </Box>

      {/* Diff Lines */}
      {displayed.map((line, idx) => {
        if (line.type === 'hunk') {
          return (
            <Box key={idx} marginY={0}>
              <Text color="cyan">{line.text}</Text>
            </Box>
          );
        }

        if (line.type === 'add') {
          const numStr = (line.newLineNumber || '').toString().padStart(4, ' ');
          return (
            <Box key={idx}>
              <Text color="green">{numStr} + </Text>
              <Text color="green">{line.text}</Text>
            </Box>
          );
        }

        if (line.type === 'remove') {
          const numStr = (line.oldLineNumber || '').toString().padStart(4, ' ');
          return (
            <Box key={idx}>
              <Text color="red">{numStr} - </Text>
              <Text color="red">{line.text}</Text>
            </Box>
          );
        }

        if (line.type === 'context') {
          const numStr = (line.newLineNumber || line.oldLineNumber || '').toString().padStart(4, ' ');
          return (
            <Box key={idx}>
              <Text color="gray">{numStr}   </Text>
              <Text color="white">{line.text}</Text>
            </Box>
          );
        }

        return null;
      })}

      {remaining > 0 && (
        <Box marginTop={1}>
          <Text color="gray">... +{remaining} more lines</Text>
        </Box>
      )}

      {/* Footer Summary */}
      <Box marginTop={1}>
        <Text color="gray">
          Updated file with <Text color="green" bold>{additions} additions</Text> and{' '}
          <Text color="red" bold>{removals} removals</Text>.
        </Text>
      </Box>
    </Box>
  );
};
