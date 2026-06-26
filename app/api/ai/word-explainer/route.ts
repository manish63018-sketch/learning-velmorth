import { NextResponse } from 'next/server';
import { callGemini, extractGeminiText, VELMORTH_SENSEI_PROMPT } from '@/lib/gemini';

// Fallback dictionary for common words
const FALLBACK_WORDS: Record<string, any> = {
  "食べる": {
    japanese: "食べる",
    hiragana: "たべる",
    katakana: "",
    romaji: "Taberu",
    english: "To eat",
    hindi: "खाना",
    simpleMeaning: "To consume food.",
    detailedMeaning: "A transitive Group 2 (Ichidan) verb meaning to eat or consume food.",
    wordType: "Verb",
    jlptLevel: "N5",
    frequencyRank: "Top 100",
    usageRegister: "Polite/Casual",
    commonSituations: "Daily life, Restaurants",
    memoryTrick: "Sounds like 'table' - where you sit to eat!",
    rootBreakdown: "食 (eat) + べる (verb ending)",
    synonyms: "食す, 召し上がる",
    opposites: "飲む",
    easySentenceJa: "りんごを食べます。",
    easySentenceEn: "I eat an apple.",
    intermediateSentenceJa: "日本の寿司を食べてみたいです。",
    intermediateSentenceEn: "I want to try eating Japanese sushi.",
    advancedSentenceJa: "栄養バランスを考慮した食事を毎朝食べるように心がけています。",
    advancedSentenceEn: "I make it a point to eat a nutritionally balanced meal every morning.",
    realLifeUsage: "Used daily when referring to meals, dining, and food consumption.",
    commonMistakes: "Do not mix with 飲む (nomu) which is for drinks and soup.",
    relatedGrammar: "〜たい (want to), 〜ている (currently eating)",
    relatedVocabulary: "食べ物 (food), 朝食 (breakfast)",
    pronunciationTips: "Flat intonation on 'taberu'.",
    culturalNotes: "Saying 'Itadakimasu' before eating is customary in Japan.",
    audioReadingText: "たべる",
    emoji: "🍣",
    visualAssociation: "A person sitting at a table eating a delicious bowl of ramen.",
    difficulty: "Easy",
    reviewPriority: "High",
    aiTutorExplanation: "Hello! Taberu (食べる) is one of the most essential verbs in Japanese. As an Ichidan verb, conjugating it is simple: just drop 'ru' and add 'masu' to get 'tabemasu'. Keep practicing and eat well! がんばって！"
  }
};

export async function POST(request: Request) {
  let word = "";
  try {
    const body = await request.json();
    word = body.word;
    if (!word || typeof word !== 'string') {
      return NextResponse.json({ error: 'Word is required' }, { status: 400 });
    }

    const prompt = `
You are Velmorth Sensei, an expert Japanese teacher.
Generate a complete, comprehensive, and advanced Japanese learning structure for the word: "${word}".

You MUST return a JSON object with the exact keys below. Do NOT add markdown code fences (like \`\`\`json) outside the JSON. Return only the raw JSON string.

Keys required in JSON:
1. "japanese": The word itself (e.g. 食べる)
2. "hiragana": Hiragana representation (e.g. たべる)
3. "katakana": Katakana representation if applicable (or empty string "")
4. "romaji": Romaji spelling (e.g. Taberu)
5. "english": Core English translation (e.g. To Eat)
6. "hindi": Core Hindi meaning (e.g. खाना)
7. "simpleMeaning": A short, simple definition.
8. "detailedMeaning": An exhaustive linguistic definition of the word's behavior.
9. "wordType": The category (must be "Noun", "Verb", "Adjective", "Adverb", "Particle", or "Expression")
10. "jlptLevel": E.g., "N5", "N4", "N3", "N2", "N1"
11. "frequencyRank": Estimated frequency rank in common usage (e.g. Top 100, Top 500, etc.)
12. "usageRegister": E.g., "Formal / Informal", "Polite", "Casual", etc.
13. "commonSituations": Where it is commonly used (e.g. Daily life, Restaurants, business)
14. "memoryTrick": A mnemonic memory hook to help remember it (e.g. Taberu sounds like Table).
15. "rootBreakdown": Breakdown of kanji/radical components.
16. "synonyms": Synonyms of the word.
17. "opposites": Opposites of the word.
18. "easySentenceJa": An easy Japanese sentence using the word.
19. "easySentenceEn": English translation of the easy sentence.
20. "intermediateSentenceJa": An intermediate Japanese sentence using the word.
21. "intermediateSentenceEn": English translation of the intermediate sentence.
22. "advancedSentenceJa": An advanced Japanese sentence using the word.
23. "advancedSentenceEn": English translation of the advanced sentence.
24. "realLifeUsage": Context on where Japanese natives use it in daily life.
25. "commonMistakes": Pitfalls or mistakes learners make with this word.
26. "relatedGrammar": Grammar rules related to this word.
27. "relatedVocabulary": Vocab words related to this.
28. "pronunciationTips": Phonics/pronunciation hints.
29. "culturalNotes": Cultural context or etiquette related to the word.
30. "audioReadingText": Text that represents phonetic reading.
31. "emoji": Appropriate emoji association (e.g. 🍣)
32. "visualAssociation": Description of a visual image to associate with the word.
33. "difficulty": "Easy", "Medium", or "Hard"
34. "reviewPriority": Recommended review priority (High, Medium, Low)
35. "aiTutorExplanation": A warm, encouraging paragraph from Velmorth Sensei explaining how to use it.
`.trim();

    const data = await callGemini(
      [{ role: 'user', parts: [{ text: prompt }] }],
      VELMORTH_SENSEI_PROMPT
    );

    const rawText = extractGeminiText(data);
    
    // Strip code fences if the model included them anyway
    const jsonText = rawText
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    const parsedData = JSON.parse(jsonText);
    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error('[Gemini Explainer] Error, falling back to mock response:', error.message);
    
    // Check if we have a matching mock word
    if (word && FALLBACK_WORDS[word]) {
      return NextResponse.json({ ...FALLBACK_WORDS[word], fallback: true });
    }

    // Generic dynamic mock response
    return NextResponse.json({
      japanese: word || "日本語",
      hiragana: "にほんご",
      katakana: "",
      romaji: "Nihongo",
      english: `Meaning of ${word || 'Japanese'}`,
      hindi: "जापानी भाषा",
      simpleMeaning: `A Japanese vocabulary term: ${word || 'Nihongo'}.`,
      detailedMeaning: `The word "${word || 'Nihongo'}" represents a common vocabulary term in modern Japanese.`,
      wordType: "Noun",
      jlptLevel: "N5",
      frequencyRank: "Top 500",
      usageRegister: "Neutral",
      commonSituations: "General conversation",
      memoryTrick: "Try writing it down and repeating it out loud!",
      rootBreakdown: "Consists of standard kanji or phonetic kana characters.",
      synonyms: "N/A",
      opposites: "N/A",
      easySentenceJa: `${word || '日本語'}を勉強しています。`,
      easySentenceEn: `I am studying ${word || 'Japanese'}.`,
      intermediateSentenceJa: `毎日${word || '日本語'}の練習をすると上手になります。`,
      intermediateSentenceEn: `Practicing ${word || 'Japanese'} daily will make you proficient.`,
      advancedSentenceJa: `語学学習において、毎日${word || '日本語'}に触れることが最も重要です。`,
      advancedSentenceEn: `In language learning, daily exposure to ${word || 'Japanese'} is the most crucial aspect.`,
      realLifeUsage: "Frequently used in daily communication and writing.",
      commonMistakes: "Ensure correct pronunciation and stroke order.",
      relatedGrammar: "N/A",
      relatedVocabulary: "N/A",
      pronunciationTips: "Pronounce clearly with flat tone.",
      culturalNotes: "Polite speech reflects mutual respect in Japanese society.",
      audioReadingText: word || "にほんご",
      emoji: "🎌",
      visualAssociation: "A cherry blossom petal falling on a study notebook.",
      difficulty: "Easy",
      reviewPriority: "Medium",
      aiTutorExplanation: `Hi! ${word ? `"${word}"` : 'This word'} is a wonderful addition to your vocabulary. Remember, consistent daily practice is the key to retention. Keep up the good work! がんばって！`,
      fallback: true
    });
  }
}
