'use client';

import { Box, FileText, MessageSquare, ArrowUpRight, ArrowRight } from 'lucide-react';

const icons = {
  box: Box,
  'file-text': FileText,
  'message-square': MessageSquare,
  'arrow-up-right': ArrowUpRight,
  'arrow-right': ArrowRight,
};

export function HomeIcon({ name, size, className }: {
  name: keyof typeof icons; size: number; className?: string;
}) {
  const Icon = icons[name];
  return <Icon size={size} className={className} aria-hidden="true" />;
}
