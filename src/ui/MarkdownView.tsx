import React from 'react';
import { Box, Text } from 'ink';

interface MarkdownViewProps {
  content: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];
  let blockKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start / end
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        const lang = codeBlockLang;
        const codeLines = [...codeBlockLines];
        renderedElements.push(
          <Box
            key={`code_${blockKey++}`}
            flexDirection="column"
            borderStyle="round"
            borderColor="gray"
            paddingX={1}
            marginY={1}
          >
            {lang ? (
              <Box justifyContent="flex-end">
                <Text color="gray">{lang}</Text>
              </Box>
            ) : null}
            {codeLines.map((cl, cIdx) => (
              <Text key={cIdx} color="cyan">
                {cl || ' '}
              </Text>
            ))}
          </Box>
        );
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockLines = [];
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      renderedElements.push(
        <Box key={`h3_${i}`} marginY={0}>
          <Text bold color="yellow">
            {line.slice(4)}
          </Text>
        </Box>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      renderedElements.push(
        <Box key={`h2_${i}`} marginY={0}>
          <Text bold color="cyanBright">
            {line.slice(3)}
          </Text>
        </Box>
      );
      continue;
    }
    if (line.startsWith('# ')) {
      renderedElements.push(
        <Box key={`h1_${i}`} marginY={0}>
          <Text bold color="#FF6B35">
            {line.slice(2)}
          </Text>
        </Box>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      renderedElements.push(
        <Box key={`quote_${i}`} borderStyle="classic" borderColor="gray" paddingLeft={1}>
          <Text italic color="gray">
            {line.slice(2)}
          </Text>
        </Box>
      );
      continue;
    }

    // List item
    if (line.match(/^[\*\-]\s+/)) {
      const text = line.replace(/^[\*\-]\s+/, '');
      renderedElements.push(
        <Box key={`li_${i}`} marginLeft={1}>
          <Text color="#FF6B35">• </Text>
          {renderInlineMarkdown(text)}
        </Box>
      );
      continue;
    }

    // Numbered list item
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      renderedElements.push(
        <Box key={`num_${i}`} marginLeft={1}>
          <Text color="cyan">{numMatch[1]}. </Text>
          {renderInlineMarkdown(numMatch[2])}
        </Box>
      );
      continue;
    }

    // Table line
    if (line.startsWith('|') && line.endsWith('|')) {
      const cols = line
        .split('|')
        .slice(1, -1)
        .map(c => c.trim());
      // Skip separator row |---|---|
      if (cols.some(c => c.match(/^-+$/))) {
        continue;
      }
      renderedElements.push(
        <Box key={`tbl_${i}`} flexDirection="row" gap={2}>
          {cols.map((col, cIdx) => (
            <Box key={cIdx} width={18}>
              <Text color="white">{col}</Text>
            </Box>
          ))}
        </Box>
      );
      continue;
    }

    // Normal paragraph line
    if (!line.trim()) {
      renderedElements.push(<Box key={`empty_${i}`} height={1} />);
    } else {
      renderedElements.push(
        <Box key={`p_${i}`}>
          {renderInlineMarkdown(line)}
        </Box>
      );
    }
  }

  // If stream ended with unclosed code block, still render it!
  if (inCodeBlock && codeBlockLines.length > 0) {
    renderedElements.push(
      <Box
        key={`code_unclosed`}
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        marginY={1}
      >
        {codeBlockLines.map((cl, cIdx) => (
          <Text key={cIdx} color="cyan">
            {cl || ' '}
          </Text>
        ))}
      </Box>
    );
  }

  return <Box flexDirection="column">{renderedElements}</Box>;
};

function renderInlineMarkdown(text: string): React.ReactNode {
  // Parse inline `code`, **bold**, *italic*
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Text key={`txt_${lastIndex}`} color="white">
          {text.slice(lastIndex, match.index)}
        </Text>
      );
    }

    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(
        <Text key={`code_${match.index}`} color="yellow">
          {token.slice(1, -1)}
        </Text>
      );
    } else if (token.startsWith('**')) {
      parts.push(
        <Text key={`bold_${match.index}`} bold color="white">
          {token.slice(2, -2)}
        </Text>
      );
    } else if (token.startsWith('*')) {
      parts.push(
        <Text key={`italic_${match.index}`} italic color="gray">
          {token.slice(1, -1)}
        </Text>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(
      <Text key={`txt_end`} color="white">
        {text.slice(lastIndex)}
      </Text>
    );
  }

  return <Text>{parts}</Text>;
}
