import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { ToolExecutionResult } from '../agent/types.js';
import { DiffView } from './DiffView.js';

interface ToolCallViewProps {
  callLine: string;
  result?: ToolExecutionResult;
  isExecuting?: boolean;
  expanded?: boolean;
}

export const ToolCallView: React.FC<ToolCallViewProps> = ({
  callLine,
  result,
  isExecuting,
  expanded = false,
}) => {
  // If result has a diff, render the DiffView!
  if (result?.diff) {
    const filePath = result.arguments?.path || 'file';
    const adds = (result.arguments?.new_string?.match(/\n/g) || []).length || 1;
    const rems = (result.arguments?.old_string?.match(/\n/g) || []).length || 0;
    return (
      <Box flexDirection="column" marginY={0}>
        <Text color="#FF6B35">{callLine}</Text>
        <DiffView patch={result.diff} filePath={filePath} additions={adds} removals={rems} />
      </Box>
    );
  }

  const outputLines = result ? result.output.split('\n') : [];
  const MAX_COLLAPSED_LINES = 6;
  const isLong = outputLines.length > MAX_COLLAPSED_LINES;
  const showLines = expanded || !isLong ? outputLines : outputLines.slice(0, MAX_COLLAPSED_LINES);
  const remainingCount = outputLines.length - MAX_COLLAPSED_LINES;

  return (
    <Box flexDirection="column" marginY={0}>
      {/* Tool Call Line */}
      <Box>
        <Text color="#FF6B35" bold>
          {callLine}
        </Text>
        {isExecuting && (
          <Text color="gray"> (running...)</Text>
        )}
      </Box>

      {/* Indented Result Summary */}
      {result && (
        <Box flexDirection="column" marginLeft={2}>
          {result.isError ? (
            <Text color="red">
              ⎿ <Text bold>{result.output.slice(0, 150)}</Text>
            </Text>
          ) : (
            <Box flexDirection="column">
              <Text color="gray">
                ⎿ {showLines[0] || 'Done'}
              </Text>
              {showLines.slice(1).map((line, lIdx) => (
                <Text key={lIdx} color="gray">
                  {'  '}{line}
                </Text>
              ))}
              {isLong && !expanded && (
                <Text color="yellow">
                  {'  '}… +{remainingCount} lines (ctrl+r to expand)
                </Text>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
