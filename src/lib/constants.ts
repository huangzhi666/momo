export const LEVELS = ['gaokao', 'cet4', 'cet6', 'ielts', 'ky', 'toefl'] as const
export type Level = (typeof LEVELS)[number]

export const LEVEL_META: Record<
  Level,
  { label: string; short: string; tags: string[]; description: string }
> = {
  gaokao: {
    label: '高考',
    short: '高考',
    tags: ['zk', 'gk'],
    description: '高中课标与高考词汇，叙事和说明为主',
  },
  cet4: {
    label: '四级',
    short: 'CET-4',
    tags: ['zk', 'gk', 'cet4'],
    description: '大学英语四级词汇，长度中等',
  },
  cet6: {
    label: '六级',
    short: 'CET-6',
    tags: ['zk', 'gk', 'cet4', 'cet6'],
    description: '大学英语六级词汇，信息密度更高',
  },
  ielts: {
    label: '雅思',
    short: 'IELTS',
    tags: ['zk', 'gk', 'cet4', 'cet6', 'ielts'],
    description: '雅思阅读风格，话题更广',
  },
  ky: {
    label: '考研',
    short: '考研',
    tags: ['zk', 'gk', 'cet4', 'cet6', 'ky'],
    description: '考研英语阅读风格，长句与论证',
  },
  toefl: {
    label: '托福',
    short: 'TOEFL',
    tags: ['zk', 'gk', 'cet4', 'cet6', 'toefl'],
    description: '托福阅读风格，学术说明',
  },
}

export const GENRES = ['narrative', 'expository', 'news', 'dialogue', 'argument'] as const
export type Genre = (typeof GENRES)[number]

export const GENRE_META: Record<Genre, { label: string; prompt: string }> = {
  narrative: { label: '记叙', prompt: 'a short narrative with a clear scene and concrete actions' },
  expository: { label: '说明', prompt: 'an explanatory piece that answers a practical question' },
  news: { label: '新闻', prompt: 'a short feature-style news report with a human angle' },
  dialogue: { label: '对话', prompt: 'a scene driven mostly by natural dialogue between two people' },
  argument: { label: '议论', prompt: 'a short opinion piece with one clear claim and two reasons' },
}

export const LENGTHS = [200, 320, 450, 600] as const
export type ArticleLength = (typeof LENGTHS)[number]

export const OXFORD_MODES = ['oxford3000', 'a1b2', 'off'] as const
export type OxfordMode = (typeof OXFORD_MODES)[number]

export const OXFORD_MODE_META: Record<OxfordMode, { label: string; hint: string }> = {
  oxford3000: { label: 'Oxford 3000', hint: 'Oxford 3000 全部（A1–B2）永不标注' },
  a1b2: { label: '仅 A1–B2', hint: 'Oxford 3000 本身就是 A1–B2，当前与上一项等价' },
  off: { label: '关闭', hint: '只保留功能词白名单，风险更高' },
}

export const VOICES = [
  { id: 'female-us', label: '女声 · 美音', accent: 'us', gender: 'female' },
  { id: 'male-us', label: '男声 · 美音', accent: 'us', gender: 'male' },
  { id: 'female-uk', label: '女声 · 英音', accent: 'uk', gender: 'female' },
  { id: 'male-uk', label: '男声 · 英音', accent: 'uk', gender: 'male' },
] as const

export type VoiceId = (typeof VOICES)[number]['id']

export const PLAYBACK_RATES = [0.75, 0.9, 1.0, 1.15] as const
export const GAP_FACTORS = [0.8, 1.2, 1.6] as const
export const LOOP_COUNTS = [1, 3, 5] as const

export const DEFAULT_SETTINGS = {
  level: 'gaokao' as Level,
  length: 320 as ArticleLength,
  newWords: 12,
  voice: 'female-us' as VoiceId,
  oxfordMode: 'oxford3000' as OxfordMode,
  showForgetUnderline: false,
  gapFactor: 1.2,
  playbackRate: 1,
}

export const NEW_WORD_MIN = 10
export const NEW_WORD_MAX = 100
export const MAX_IMPORT_CHARS = 20_000
export const MAX_SUPPLEMENT_CHARS = 300
export const NEW_WORD_DENSITY_CAP = 0.12
export const RECENT_TOPIC_EXCLUSION = 5
export const RECENT_TARGET_EXCLUSION = 3

export const TOPIC_POOL = [
  'a night market that closes at dawn',
  'learning to repair an old bicycle',
  'the last ferry of the day',
  'a small library that lends tools',
  'the first week at a new job',
  'a power cut in a tall building',
  'a community garden in autumn',
  'the sound of a city waking up',
  'a train journey with a delayed stop',
  'a bakery before sunrise',
  'an apartment with thin walls',
  'a hiking trip that goes off plan',
  'the return of a neighbourhood cinema',
  'a volunteer shift at an animal shelter',
  'a street food stall and its regulars',
  'the hidden work of a hotel cleaner',
  'a school reunion after ten years',
  'a move to a smaller town',
  'a broken lift and a long staircase',
  'the last day of a summer camp',
  'a rainstorm during a football match',
  'a second-hand bookshop closing down',
  'a bus driver who knows everyone',
  'a cooking class for beginners',
  'a beach clean-up on a cold morning',
  'the challenge of learning to swim as an adult',
  'a shared office with one quiet room',
  'an old photograph found in a drawer',
  'a market trader who sells only one thing',
  'the night shift at a hospital',
  'a bicycle lane that suddenly ends',
  'a neighbour who plays the piano',
  'a long walk home after a concert',
  'a village with no street lights',
  'a café that bans phones',
  'a repair café for broken appliances',
  'the first snow of the year',
  'a ferry crossing in fog',
  'an interview for a job you almost want',
  'a family recipe that keeps changing',
  'a rooftop garden above a car park',
  'the queue outside a new bakery',
  'a lost wallet and an honest stranger',
  'a sports team that keeps losing',
  'a museum guard with a favourite room',
  'a language exchange that goes wrong',
  'a camping trip in heavy rain',
  'a small business moving online',
  'the last video rental shop',
  'a park bench and its regular visitors',
]

export const GENRE_LABELS_ZH: Record<Genre, string> = {
  narrative: '记叙',
  expository: '说明',
  news: '新闻',
  dialogue: '对话',
  argument: '议论',
}

export const EXAM_TAG_LABELS: Record<string, string> = {
  zk: '中考',
  gk: '高考',
  cet4: '四级',
  cet6: '六级',
  ky: '考研',
  ielts: '雅思',
  toefl: '托福',
  gre: 'GRE',
}

export const MAX_RECENT_WORDS = 12
