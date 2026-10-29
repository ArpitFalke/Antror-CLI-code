import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface SpinnerViewProps {
  verb?: string;
  startTime: number;
  tokens?: number;
  cost?: number;
}

const WHIMSICAL_VERBS = [
  'Thinking',
  'Pondering',
  'Analyzing',
  'Synthesizing',
  'Investigating',
  'Architecting',
  'Reasoning',
  'Deciphering',
  'Brainstorming',
  'Reflecting',
  'Evaluating',
];

export const SpinnerView: React.FC<SpinnerViewProps> = ({
  verb: initialVerb,
  startTime,
  tokens = 0,
  cost = 0,
}) => {
  const [verb, setVerb] = useState(initialVerb || 'Thinking');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 100) / 10);
    }, 250);

    const verbInterval = setInterval(() => {
      const nextVerb = WHIMSICAL_VERBS[Math.floor(Math.random() * WHIMSICAL_VERBS.length)];
      setVerb(nextVerb);
    }, 4000);

    return () => {
      clearInterval(timer);
      clearInterval(verbInterval);
    };
  }, [startTime]);

  const costStr = cost > 0 ? ` ($${cost.toFixed(4)})` : '';
  const tokenStr = tokens > 0 ? ` · ${tokens.toLocaleString()} tokens${costStr}` : '';

  return (
    <Box marginY={0} flexDirection="row" alignItems="center">
      <Text color="#FF6B35">
        <Spinner type="dots" />
      </Text>
      <Text color="white" bold>
        {' '}{verb}…
      </Text>
      <Text color="gray">
        {' '}({elapsed.toFixed(1)}s{tokenStr})
      </Text>
      <Text color="gray" italic>
        {' '}· esc to interrupt
      </Text>
    </Box>
  );
};
