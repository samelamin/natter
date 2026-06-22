export const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://natter.cc').replace(/\/$/, '');

export const SITE_NAME = 'Natter';

export const SITE_TITLE = 'Natter - Voice-first film and TV recommendations';

export const SITE_DESCRIPTION =
  'Tell Natter what you want to watch and get film and TV recommendations with where-to-watch options for your streaming services.';

export const SEO_KEYWORDS = [
  'film recommendations',
  'TV recommendations',
  'movie recommendations',
  'where to watch movies',
  'where to watch TV shows',
  'streaming recommendations',
  'what to watch tonight',
  'watchlist app',
  'Natter',
];

export const SEARCH_PAGES = [
  {
    slug: 'where-to-watch',
    title: 'Where to watch films and TV shows',
    metaTitle: 'Where to Watch Films and TV Shows - Natter',
    description:
      'Find what to watch and see streaming, rent, and buy options in one recommendation flow.',
    query: 'where to watch something good tonight',
    intent:
      'Use this when you know the mood but not the title. Natter turns a plain-language request into real film and TV picks, then checks where they are available.',
    examples: [
      'Where to watch a tense thriller tonight',
      'Where to watch a funny comfort show',
      'Where to watch a family film this weekend',
    ],
  },
  {
    slug: 'what-to-watch-tonight',
    title: 'What to watch tonight',
    metaTitle: 'What to Watch Tonight - Natter',
    description:
      'Get fast film and TV ideas for tonight based on your mood, time, and streaming services.',
    query: 'what should I watch tonight',
    intent:
      'Best for open-ended searches where you want a short list instead of browsing endless rows.',
    examples: [
      'Something short and funny to watch tonight',
      'A gripping film under two hours',
      'A new series I can start tonight',
    ],
  },
  {
    slug: 'netflix-recommendations',
    title: 'Netflix recommendations',
    metaTitle: 'Netflix Recommendations - Natter',
    description:
      'Ask for Netflix-friendly film and TV recommendations by mood, genre, runtime, or who is watching.',
    query: 'something good to watch on Netflix',
    intent:
      'Use Natter to start with the feeling you want, then narrow the results to services you can actually watch.',
    examples: [
      'A clever Netflix thriller',
      'A Netflix comedy series for tonight',
      'A Netflix film to watch with friends',
    ],
  },
  {
    slug: 'disney-plus-recommendations',
    title: 'Disney Plus recommendations',
    metaTitle: 'Disney Plus Recommendations - Natter',
    description:
      'Find Disney Plus films and series for family nights, comfort watching, animation, adventures, and more.',
    query: 'something good to watch on Disney Plus',
    intent:
      'Good when the service is fixed but the taste brief is still human: cosy, exciting, age-appropriate, nostalgic, or new.',
    examples: [
      'A Disney Plus film for the whole family',
      'A nostalgic Disney Plus adventure',
      'A smart animated movie on Disney Plus',
    ],
  },
  {
    slug: 'prime-video-recommendations',
    title: 'Prime Video recommendations',
    metaTitle: 'Prime Video Recommendations - Natter',
    description:
      'Find Prime Video films and TV shows that fit your mood instead of scrolling through the catalogue.',
    query: 'something good to watch on Prime Video',
    intent:
      'Ask naturally for the kind of night you want and use the app to bias picks toward your selected services.',
    examples: [
      'A Prime Video sci-fi film',
      'A Prime Video show like a mystery box',
      'A feel-good movie on Prime Video',
    ],
  },
  {
    slug: 'apple-tv-recommendations',
    title: 'Apple TV recommendations',
    metaTitle: 'Apple TV Recommendations - Natter',
    description:
      'Discover Apple TV films and series by tone, genre, pace, and who you are watching with.',
    query: 'something good to watch on Apple TV',
    intent:
      'Useful for premium drama, science fiction, documentaries, and compact series picks when you want fewer, better options.',
    examples: [
      'A prestige drama on Apple TV',
      'An Apple TV sci-fi show',
      'A thoughtful Apple TV series',
    ],
  },
  {
    slug: 'family-movie-night',
    title: 'Family movie night recommendations',
    metaTitle: 'Family Movie Night Recommendations - Natter',
    description:
      'Find family-friendly films and shows that fit the ages, mood, and streaming services in your house.',
    query: 'a film to watch with the family',
    intent:
      'Use this for co-viewing searches where age, tone, and attention span matter as much as genre.',
    examples: [
      'A family movie that adults will enjoy too',
      'A gentle film for younger kids',
      'A fun adventure for family movie night',
    ],
  },
  {
    slug: 'date-night-movies',
    title: 'Date night movie recommendations',
    metaTitle: 'Date Night Movie Recommendations - Natter',
    description:
      'Get date night film ideas by vibe: romantic, funny, stylish, low-stakes, intense, or conversation-starting.',
    query: 'a good movie for date night',
    intent:
      'Natter works well when genre labels are too blunt and the real brief is a social mood.',
    examples: [
      'A charming date night movie',
      'A funny film that is not too silly',
      'A stylish thriller for date night',
    ],
  },
  {
    slug: 'horror-movies',
    title: 'Horror movie recommendations',
    metaTitle: 'Horror Movie Recommendations - Natter',
    description:
      'Find horror films by scare level, subgenre, pace, and whether you want gore, dread, ghosts, or suspense.',
    query: 'a scary movie to watch tonight',
    intent:
      'Ask for the exact kind of scary you want, from quiet dread to jump scares, then get watchable options.',
    examples: [
      'A scary movie without much gore',
      'A supernatural horror film',
      'A tense horror movie under two hours',
    ],
  },
  {
    slug: 'feel-good-movies',
    title: 'Feel-good movie recommendations',
    metaTitle: 'Feel-Good Movie Recommendations - Natter',
    description:
      'Find uplifting films and shows for comfort watching, low-stress nights, and warm recommendations.',
    query: 'a feel-good movie to watch',
    intent:
      'Use mood-first prompts when you want something safe, warm, or restorative without trawling through generic lists.',
    examples: [
      'A cosy feel-good movie',
      'A warm comedy drama',
      'A comforting TV show after work',
    ],
  },
  {
    slug: 'thriller-recommendations',
    title: 'Thriller recommendations',
    metaTitle: 'Thriller Recommendations - Natter',
    description:
      'Find tense thrillers, mysteries, crime stories, and twisty films or shows that match your appetite.',
    query: 'a tense thriller to watch',
    intent:
      'Tell Natter how intense, dark, clever, or fast you want the story to be and get matching film and TV picks.',
    examples: [
      'A twisty thriller with a smart ending',
      'A crime series that moves fast',
      'A tense film like a conspiracy thriller',
    ],
  },
  {
    slug: 'watchlist-app',
    title: 'Film and TV watchlist app',
    metaTitle: 'Film and TV Watchlist App - Natter',
    description:
      'Save films and TV shows to a watchlist, mark what you watched, and sync with Trakt.',
    query: 'help me build a watchlist of things to watch',
    intent:
      'Natter is not just a search box: signed-in users can keep a watchlist, export it, and use watched history to avoid repeats.',
    examples: [
      'Build a watchlist for the weekend',
      'Find films I can save for later',
      'Recommend shows and keep a watchlist',
    ],
  },
];

export function searchPageBySlug(slug) {
  return SEARCH_PAGES.find((page) => page.slug === slug) || null;
}

export function absoluteUrl(path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized}`;
}

export function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
