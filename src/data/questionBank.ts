import { UNIT_7_QUESTIONS } from './questionBankUnit7.ts';
import { UNIT_8_QUESTIONS } from './questionBankUnit8.ts';
import { UNIT_9_QUESTIONS } from './questionBankUnit9.ts';
import { SAMPLE_QUESTIONS, type SampleQuestionSeed } from './seedContent.ts';

export const UNIT_EXPANSION_QUESTIONS: SampleQuestionSeed[] = [
  ...UNIT_7_QUESTIONS,
  ...UNIT_8_QUESTIONS,
  ...UNIT_9_QUESTIONS,
];

export const ALL_SEEDED_QUESTIONS: SampleQuestionSeed[] = [
  ...SAMPLE_QUESTIONS,
  ...UNIT_EXPANSION_QUESTIONS,
];
