const moods: [RegExp, string][] = [
  [/груст|печаль|тоск|sad|melanchol|heartbreak/i, "sad melancholic"],
  [/весел|весёл|радост|счаст|happy|joy|feel good/i, "happy feel good"],
  [/тренир|спорт|в зале|на зал|workout|gym|fitness/i, "workout energetic"],
  [/дорог|машин|за рул|road|driv|commut/i, "road trip driving"],
  [/спокой|расслаб|calm|relax|chill/i, "chill ambient"],
  [/работ|учеб|учёб|focus|study|work music/i, "focus instrumental"],
  [/ноч|sleep|night/i, "night chill"],
];
export function moodQuery(query: string) {
  return moods.find(([pattern]) => pattern.test(query))?.[1] || query;
}
