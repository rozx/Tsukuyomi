import type { AppLocale } from 'src/models/locale';

/**
 * 截图用演示书库：十部青空文库的公有领域作品，文案分三种界面语言。
 * 只用于 `bun run screenshots`，不进应用包。
 */

type Localized<T = string> = Record<AppLocale, T>;

export type DemoCoverMotif =
  | 'stars'
  | 'cat'
  | 'gate'
  | 'sun'
  | 'forest'
  | 'moon'
  | 'waves'
  | 'thread'
  | 'rings'
  | 'mask';

export interface DemoBook {
  key: string;
  /** 青空文库路径，接在 https://www.aozora.gr.jp/cards/ 后面 */
  aozoraPath: string;
  originalTitle: string;
  originalAuthor: string;
  title: Localized;
  author: Localized;
  description: Localized;
  tags: Localized<string[]>;
  starred?: boolean;
  /** 相对截图时刻的创建 / 最后编辑时间 */
  createdDaysAgo: number;
  editedHoursAgo: number;
  cover: { motif: DemoCoverMotif; colors: [string, string, string] };
}

export const DEMO_MAIN_BOOK_KEY = 'ginga';

export const DEMO_BOOKS: DemoBook[] = [
  {
    key: 'ginga',
    aozoraPath: '000081/files/456_15050.html',
    originalTitle: '銀河鉄道の夜',
    originalAuthor: '宮沢賢治',
    title: {
      'zh-CN': '银河铁道之夜',
      'zh-TW': '銀河鐵道之夜',
      'en-US': 'Night on the Galactic Railroad',
    },
    author: { 'zh-CN': '宫泽贤治', 'zh-TW': '宮澤賢治', 'en-US': 'Kenji Miyazawa' },
    description: {
      'zh-CN':
        '银河节之夜，孤独的少年乔班尼与好友康帕内拉登上了驶向星空的列车。两人沿着天河一路南行，在旅途中寻找「真正的幸福」。',
      'zh-TW':
        '銀河祭之夜，孤獨的少年喬凡尼與好友坎帕奈拉登上了駛向星空的列車。兩人沿著天河一路南行，在旅途中尋找「真正的幸福」。',
      'en-US':
        'On the night of the Milky Way festival, the lonely boy Giovanni boards a train bound for the stars with his friend Campanella, travelling south along the river of heaven in search of true happiness.',
    },
    tags: {
      'zh-CN': ['童话', '幻想', '青空文库'],
      'zh-TW': ['童話', '奇幻', '青空文庫'],
      'en-US': ['Fairy tale', 'Fantasy', 'Aozora Bunko'],
    },
    starred: true,
    createdDaysAgo: 46,
    editedHoursAgo: 0.4,
    cover: { motif: 'stars', colors: ['#0b1437', '#27306e', '#f6d98b'] },
  },
  {
    key: 'neko',
    aozoraPath: '000148/files/789_14547.html',
    originalTitle: '吾輩は猫である',
    originalAuthor: '夏目漱石',
    title: { 'zh-CN': '我是猫', 'zh-TW': '我是貓', 'en-US': 'I Am a Cat' },
    author: { 'zh-CN': '夏目漱石', 'zh-TW': '夏目漱石', 'en-US': 'Natsume Sōseki' },
    description: {
      'zh-CN': '一只没有名字的猫，冷眼旁观中学教师苦沙弥一家与来往客人的日常。',
      'zh-TW': '一隻沒有名字的貓，冷眼旁觀中學教師苦沙彌一家與來往客人的日常。',
      'en-US':
        'A nameless cat coolly observes the household of the schoolteacher Kushami and the visitors who drift through it.',
    },
    tags: {
      'zh-CN': ['讽刺', '长篇'],
      'zh-TW': ['諷刺', '長篇'],
      'en-US': ['Satire', 'Novel'],
    },
    starred: true,
    createdDaysAgo: 120,
    editedHoursAgo: 20,
    cover: { motif: 'cat', colors: ['#e9dcc3', '#d9c7a3', '#2f2a26'] },
  },
  {
    key: 'kokoro',
    aozoraPath: '000148/files/773_14560.html',
    originalTitle: 'こころ',
    originalAuthor: '夏目漱石',
    title: { 'zh-CN': '心', 'zh-TW': '心', 'en-US': 'Kokoro' },
    author: { 'zh-CN': '夏目漱石', 'zh-TW': '夏目漱石', 'en-US': 'Natsume Sōseki' },
    description: {
      'zh-CN': '「我」在镰仓结识了被称作「先生」的人，多年后收到一封讲述他过去的长信。',
      'zh-TW': '「我」在鎌倉結識了被稱作「先生」的人，多年後收到一封講述他過去的長信。',
      'en-US':
        'A student befriends an older man he calls Sensei, and years later receives a long letter revealing his past.',
    },
    tags: {
      'zh-CN': ['心理', '长篇'],
      'zh-TW': ['心理', '長篇'],
      'en-US': ['Psychological', 'Novel'],
    },
    starred: true,
    createdDaysAgo: 150,
    editedHoursAgo: 30,
    cover: { motif: 'rings', colors: ['#7a1f2b', '#4c1019', '#f2e3c9'] },
  },
  {
    key: 'melos',
    aozoraPath: '000035/files/1567_14913.html',
    originalTitle: '走れメロス',
    originalAuthor: '太宰治',
    title: { 'zh-CN': '奔跑吧，梅洛斯', 'zh-TW': '跑吧，美樂斯', 'en-US': 'Run, Melos!' },
    author: { 'zh-CN': '太宰治', 'zh-TW': '太宰治', 'en-US': 'Osamu Dazai' },
    description: {
      'zh-CN': '为了不辜负替自己做人质的朋友，梅洛斯必须在日落前赶回王城。',
      'zh-TW': '為了不辜負替自己當人質的朋友，美樂斯必須在日落前趕回王城。',
      'en-US':
        'Melos must race back to the city before sunset to save the friend who stands hostage in his place.',
    },
    tags: {
      'zh-CN': ['短篇', '友情'],
      'zh-TW': ['短篇', '友情'],
      'en-US': ['Short story', 'Friendship'],
    },
    createdDaysAgo: 75,
    editedHoursAgo: 52,
    cover: { motif: 'sun', colors: ['#f4a259', '#c8553d', '#2b1d1a'] },
  },
  {
    key: 'rashomon',
    aozoraPath: '000879/files/127_15260.html',
    originalTitle: '羅生門',
    originalAuthor: '芥川龍之介',
    title: { 'zh-CN': '罗生门', 'zh-TW': '羅生門', 'en-US': 'Rashōmon' },
    author: { 'zh-CN': '芥川龙之介', 'zh-TW': '芥川龍之介', 'en-US': 'Ryūnosuke Akutagawa' },
    description: {
      'zh-CN': '暮色中的罗生门下，一个被辞退的仆人在饿死与为盗之间犹豫不决。',
      'zh-TW': '暮色中的羅生門下，一個被辭退的僕人在餓死與為盜之間猶豫不決。',
      'en-US':
        'Beneath the ruined Rashōmon gate at dusk, a dismissed servant wavers between starving and turning thief.',
    },
    tags: {
      'zh-CN': ['短篇', '王朝物'],
      'zh-TW': ['短篇', '王朝物'],
      'en-US': ['Short story', 'Historical'],
    },
    createdDaysAgo: 90,
    editedHoursAgo: 74,
    cover: { motif: 'gate', colors: ['#2a2d34', '#15171c', '#c1443c'] },
  },
  {
    key: 'sangetsuki',
    aozoraPath: '000119/files/624_14544.html',
    originalTitle: '山月記',
    originalAuthor: '中島敦',
    title: { 'zh-CN': '山月记', 'zh-TW': '山月記', 'en-US': 'The Moon Over the Mountain' },
    author: { 'zh-CN': '中岛敦', 'zh-TW': '中島敦', 'en-US': 'Atsushi Nakajima' },
    description: {
      'zh-CN': '自负的诗人李徵化身为虎，在月下向旧友袁傪讲述自己的遭遇。',
      'zh-TW': '自負的詩人李徵化身為虎，在月下向舊友袁傪講述自己的遭遇。',
      'en-US':
        'The proud poet Li Zheng, turned into a tiger, tells his old friend Yuan Can his story under the moon.',
    },
    tags: {
      'zh-CN': ['短篇', '变身谭'],
      'zh-TW': ['短篇', '變身譚'],
      'en-US': ['Short story', 'Fable'],
    },
    createdDaysAgo: 60,
    editedHoursAgo: 100,
    cover: { motif: 'moon', colors: ['#1d3b3a', '#0f2423', '#f0e6c8'] },
  },
  {
    key: 'botchan',
    aozoraPath: '000148/files/752_14964.html',
    originalTitle: '坊っちゃん',
    originalAuthor: '夏目漱石',
    title: { 'zh-CN': '哥儿', 'zh-TW': '少爺', 'en-US': 'Botchan' },
    author: { 'zh-CN': '夏目漱石', 'zh-TW': '夏目漱石', 'en-US': 'Natsume Sōseki' },
    description: {
      'zh-CN': '鲁莽又正直的东京青年到四国的中学教数学，与学生和同事闹出一连串风波。',
      'zh-TW': '魯莽又正直的東京青年到四國的中學教數學，與學生和同事鬧出一連串風波。',
      'en-US':
        'A reckless but honest young man from Tokyo takes a teaching post in Shikoku and clashes with pupils and colleagues alike.',
    },
    tags: {
      'zh-CN': ['幽默', '中篇'],
      'zh-TW': ['幽默', '中篇'],
      'en-US': ['Humor', 'Novella'],
    },
    createdDaysAgo: 110,
    editedHoursAgo: 150,
    cover: { motif: 'waves', colors: ['#2f6690', '#16425b', '#f3f0e2'] },
  },
  {
    key: 'chumon',
    aozoraPath: '000081/files/43754_17659.html',
    originalTitle: '注文の多い料理店',
    originalAuthor: '宮沢賢治',
    title: {
      'zh-CN': '要求太多的餐馆',
      'zh-TW': '要求很多的餐廳',
      'en-US': 'The Restaurant of Many Orders',
    },
    author: { 'zh-CN': '宫泽贤治', 'zh-TW': '宮澤賢治', 'en-US': 'Kenji Miyazawa' },
    description: {
      'zh-CN': '两个进山打猎的绅士走进一家「山猫轩」，门上的要求一条比一条古怪。',
      'zh-TW': '兩個進山打獵的紳士走進一家「山貓軒」，門上的要求一條比一條古怪。',
      'en-US':
        'Two gentlemen out hunting step into the Wildcat House, where each door carries a stranger request than the last.',
    },
    tags: {
      'zh-CN': ['童话', '短篇'],
      'zh-TW': ['童話', '短篇'],
      'en-US': ['Fairy tale', 'Short story'],
    },
    createdDaysAgo: 44,
    editedHoursAgo: 190,
    cover: { motif: 'forest', colors: ['#3a5a40', '#1f3524', '#e8d8a8'] },
  },
  {
    key: 'kumo',
    aozoraPath: '000879/files/92_14545.html',
    originalTitle: '蜘蛛の糸',
    originalAuthor: '芥川龍之介',
    title: { 'zh-CN': '蜘蛛之丝', 'zh-TW': '蜘蛛之絲', 'en-US': "The Spider's Thread" },
    author: { 'zh-CN': '芥川龙之介', 'zh-TW': '芥川龍之介', 'en-US': 'Ryūnosuke Akutagawa' },
    description: {
      'zh-CN': '释迦牟尼向地狱里的大盗犍陀多垂下了一根蜘蛛丝。',
      'zh-TW': '釋迦牟尼向地獄裡的大盜犍陀多垂下了一根蜘蛛絲。',
      'en-US': "The Buddha lowers a single spider's thread to the robber Kandata in hell.",
    },
    tags: {
      'zh-CN': ['童话', '短篇'],
      'zh-TW': ['童話', '短篇'],
      'en-US': ['Fairy tale', 'Short story'],
    },
    createdDaysAgo: 30,
    editedHoursAgo: 240,
    cover: { motif: 'thread', colors: ['#efe6f2', '#d8c7e0', '#5b3a6b'] },
  },
  {
    key: 'shikkaku',
    aozoraPath: '000035/files/301_14912.html',
    originalTitle: '人間失格',
    originalAuthor: '太宰治',
    title: { 'zh-CN': '人间失格', 'zh-TW': '人間失格', 'en-US': 'No Longer Human' },
    author: { 'zh-CN': '太宰治', 'zh-TW': '太宰治', 'en-US': 'Osamu Dazai' },
    description: {
      'zh-CN': '三篇手记，记录了大庭叶藏用「丑角」的面具掩饰自己、一步步走向崩溃的一生。',
      'zh-TW': '三篇手記，記錄了大庭葉藏用「丑角」的面具掩飾自己、一步步走向崩潰的一生。',
      'en-US':
        "Three notebooks trace the life of Ōba Yōzō, who hides behind a clown's mask as he slides toward ruin.",
    },
    tags: {
      'zh-CN': ['私小说', '中篇'],
      'zh-TW': ['私小說', '中篇'],
      'en-US': ['I-novel', 'Novella'],
    },
    createdDaysAgo: 200,
    editedHoursAgo: 330,
    cover: { motif: 'mask', colors: ['#d9d4cc', '#b8b1a6', '#1c1b1a'] },
  },
];

/** 没有分部的作品使用的卷名 */
export const DEMO_DEFAULT_VOLUME_TITLE = '本編';
export const DEMO_DEFAULT_VOLUME_TRANSLATION: Localized = {
  'zh-CN': '正文',
  'zh-TW': '正文',
  'en-US': 'Main text',
};

/** 主书各章标题译文，顺序与原文章节一致 */
export const DEMO_MAIN_CHAPTER_TITLES: Localized<string[]> = {
  'zh-CN': [
    '一、午后的课',
    '二、活版印刷所',
    '三、家',
    '四、半人马节之夜',
    '五、天气轮之柱',
    '六、银河车站',
    '七、北十字与上新世海岸',
    '八、捕鸟人',
    '九、乔班尼的车票',
  ],
  'zh-TW': [
    '一、午後的課',
    '二、活版印刷所',
    '三、家',
    '四、半人馬祭之夜',
    '五、天氣輪之柱',
    '六、銀河車站',
    '七、北十字與上新世海岸',
    '八、捕鳥人',
    '九、喬凡尼的車票',
  ],
  'en-US': [
    '1. The Afternoon Lesson',
    '2. The Print Shop',
    '3. Home',
    '4. The Night of the Centaur Festival',
    '5. The Pillar of the Weather Wheel',
    '6. Milky Way Station',
    '7. The Northern Cross and the Pliocene Coast',
    '8. The Bird Catcher',
    "9. Giovanni's Ticket",
  ],
};

export interface DemoCharacter {
  name: string;
  sex: 'male' | 'female' | 'other';
  translation: Localized;
  description: Localized;
  speakingStyle: Localized;
  aliases: Array<{ name: string; translation: Localized }>;
}

export const DEMO_CHARACTERS: DemoCharacter[] = [
  {
    name: 'ジョバンニ',
    sex: 'male',
    translation: { 'zh-CN': '乔班尼', 'zh-TW': '喬凡尼', 'en-US': 'Giovanni' },
    description: {
      'zh-CN': '主人公。父亲出海未归，母亲卧病，课余在活版印刷所拣铅字贴补家用。',
      'zh-TW': '主角。父親出海未歸，母親臥病，課餘在活版印刷所揀鉛字貼補家用。',
      'en-US':
        'The protagonist. His father is away at sea and his mother is ill, so he sets type at a print shop after school.',
    },
    speakingStyle: {
      'zh-CN': '内向、话少；内心独白用「我」，语气略带自责。',
      'zh-TW': '內向、話少；內心獨白用「我」，語氣略帶自責。',
      'en-US': 'Shy and quiet; inner monologue in first person, a little self-reproachful.',
    },
    aliases: [
      {
        name: '虫めがね君',
        translation: {
          'zh-CN': '放大镜小子',
          'zh-TW': '放大鏡小子',
          'en-US': 'Mr. Magnifying Glass',
        },
      },
    ],
  },
  {
    name: 'カムパネルラ',
    sex: 'male',
    translation: { 'zh-CN': '康帕内拉', 'zh-TW': '坎帕奈拉', 'en-US': 'Campanella' },
    description: {
      'zh-CN': '乔班尼的好友，博士之子。体贴而沉稳，是班上的中心人物。',
      'zh-TW': '喬凡尼的好友，博士之子。體貼而沉穩，是班上的中心人物。',
      'en-US':
        "Giovanni's close friend and the professor's son; thoughtful, calm, and popular in class.",
    },
    speakingStyle: {
      'zh-CN': '温和有礼，说话不紧不慢。',
      'zh-TW': '溫和有禮，說話不疾不徐。',
      'en-US': 'Gentle and polite, never hurried.',
    },
    aliases: [],
  },
  {
    name: 'ザネリ',
    sex: 'male',
    translation: { 'zh-CN': '扎内利', 'zh-TW': '查內利', 'en-US': 'Zanelli' },
    description: {
      'zh-CN': '同班同学，常带头取笑乔班尼。',
      'zh-TW': '同班同學，常帶頭取笑喬凡尼。',
      'en-US': 'A classmate who leads the teasing of Giovanni.',
    },
    speakingStyle: {
      'zh-CN': '轻佻、爱起哄。',
      'zh-TW': '輕佻、愛起鬨。',
      'en-US': 'Flippant and taunting.',
    },
    aliases: [],
  },
  {
    name: '先生',
    sex: 'other',
    translation: { 'zh-CN': '老师', 'zh-TW': '老師', 'en-US': 'the teacher' },
    description: {
      'zh-CN': '在理科课上讲解银河的老师。',
      'zh-TW': '在自然課上講解銀河的老師。',
      'en-US': 'The teacher who explains the Milky Way in science class.',
    },
    speakingStyle: {
      'zh-CN': '对学生用敬体，循循善诱。',
      'zh-TW': '對學生用敬體，循循善誘。',
      'en-US': 'Patient and formal with the pupils.',
    },
    aliases: [],
  },
];

export interface DemoTerm {
  name: string;
  translation: Localized;
  description: Localized;
}

export const DEMO_TERMS: DemoTerm[] = [
  {
    name: '銀河',
    translation: { 'zh-CN': '银河', 'zh-TW': '銀河', 'en-US': 'Milky Way' },
    description: {
      'zh-CN': '科学语境下的称呼，老师讲课时使用。',
      'zh-TW': '科學語境下的稱呼，老師講課時使用。',
      'en-US': 'The scientific name, used in the lesson.',
    },
  },
  {
    name: '天の川',
    translation: { 'zh-CN': '天河', 'zh-TW': '天河', 'en-US': 'river of heaven' },
    description: {
      'zh-CN': '与「銀河」区分：比喻成河流时一律译作「天河」。',
      'zh-TW': '與「銀河」區分：比喻成河流時一律譯作「天河」。',
      'en-US': 'Kept distinct from 銀河: use when it is pictured as a river.',
    },
  },
  {
    name: 'ケンタウル祭',
    translation: { 'zh-CN': '半人马节', 'zh-TW': '半人馬祭', 'en-US': 'Centaur Festival' },
    description: {
      'zh-CN': '镇上的星祭，也称「银河节」。',
      'zh-TW': '鎮上的星祭，也稱「銀河祭」。',
      'en-US': "The town's star festival, also called the Milky Way festival.",
    },
  },
  {
    name: '活版所',
    translation: { 'zh-CN': '活版印刷所', 'zh-TW': '活版印刷所', 'en-US': 'print shop' },
    description: {
      'zh-CN': '乔班尼打工的地方。',
      'zh-TW': '喬凡尼打工的地方。',
      'en-US': 'Where Giovanni works after school.',
    },
  },
  {
    name: '烏瓜',
    translation: { 'zh-CN': '王瓜', 'zh-TW': '王瓜', 'en-US': 'snake gourd' },
    description: {
      'zh-CN': '星祭时挖空做成青色小灯，放入河中。',
      'zh-TW': '星祭時挖空做成青色小燈，放入河中。',
      'en-US': 'Hollowed out to make blue lanterns floated on the river at the festival.',
    },
  },
  {
    name: '天気輪の柱',
    translation: {
      'zh-CN': '天气轮之柱',
      'zh-TW': '天氣輪之柱',
      'en-US': 'Pillar of the Weather Wheel',
    },
    description: {
      'zh-CN': '黑色山丘顶上的柱子，乔班尼在此登上列车。',
      'zh-TW': '黑色山丘頂上的柱子，喬凡尼在此登上列車。',
      'en-US': 'The pillar on the dark hilltop where Giovanni boards the train.',
    },
  },
  {
    name: 'プリオシン海岸',
    translation: { 'zh-CN': '上新世海岸', 'zh-TW': '上新世海岸', 'en-US': 'Pliocene Coast' },
    description: {
      'zh-CN': '银河岸边的化石发掘地。',
      'zh-TW': '銀河岸邊的化石發掘地。',
      'en-US': 'A fossil dig on the bank of the Milky Way.',
    },
  },
  {
    name: '北十字',
    translation: { 'zh-CN': '北十字', 'zh-TW': '北十字', 'en-US': 'Northern Cross' },
    description: {
      'zh-CN': '天鹅座，列车途经的第一站。',
      'zh-TW': '天鵝座，列車途經的第一站。',
      'en-US': 'Cygnus; the first stop on the line.',
    },
  },
];

export const DEMO_MEMORIES: Localized<Array<{ summary: string; content: string }>> = {
  'zh-CN': [
    {
      summary: '乔班尼的家境与打工',
      content:
        '乔班尼的父亲出海捕鱼，久未归来，镇上流传着他入狱的谣言；母亲卧病在床。乔班尼早上送报，下午在活版印刷所拣铅字，因此上课常常犯困，和同学也渐渐疏远。',
    },
    {
      summary: '「銀河」与「天の川」的译法',
      content:
        '老师讲课时的「銀河」译作「银河」；把它比作河流的「天の川」一律译作「天河」，不要混用。对话沿用原文的「」引号。',
    },
    {
      summary: '康帕内拉为何不回答',
      content:
        '康帕内拉明明知道银河是星星，却故意不回答老师的问题。乔班尼认为他是体谅自己答不上来。后文两人在列车上重逢时可与此呼应。',
    },
    {
      summary: '银河节的习俗',
      content:
        '镇上在银河节（半人马节）当晚挂紫杉叶球、在扁柏枝上点灯，孩子们把王瓜做成青色的灯放进河里。',
    },
  ],
  'zh-TW': [
    {
      summary: '喬凡尼的家境與打工',
      content:
        '喬凡尼的父親出海捕魚，久未歸來，鎮上流傳著他入獄的謠言；母親臥病在床。喬凡尼早上送報，下午在活版印刷所揀鉛字，因此上課常常打瞌睡，和同學也漸漸疏遠。',
    },
    {
      summary: '「銀河」與「天の川」的譯法',
      content:
        '老師講課時的「銀河」譯作「銀河」；把它比作河流的「天の川」一律譯作「天河」，不要混用。對話沿用原文的「」引號。',
    },
    {
      summary: '坎帕奈拉為何不回答',
      content:
        '坎帕奈拉明明知道銀河是星星，卻故意不回答老師的問題。喬凡尼認為他是體諒自己答不上來。後文兩人在列車上重逢時可與此呼應。',
    },
    {
      summary: '銀河祭的習俗',
      content:
        '鎮上在銀河祭（半人馬祭）當晚掛紫杉葉球、在扁柏枝上點燈，孩子們把王瓜做成青色的燈放進河裡。',
    },
  ],
  'en-US': [
    {
      summary: "Giovanni's home and his job",
      content:
        "Giovanni's father went to sea and has not come back; the town whispers that he is in prison. His mother is bedridden. Giovanni delivers papers in the morning and sets type at the print shop in the afternoon, so he is sleepy in class and has drifted apart from his classmates.",
    },
    {
      summary: 'Rendering 銀河 vs. 天の川',
      content:
        'Use "Milky Way" for 銀河 in the teacher\'s lesson, and "river of heaven" for 天の川 whenever it is pictured as a river. Do not mix the two.',
    },
    {
      summary: 'Why Campanella stayed silent',
      content:
        'Campanella knows the Milky Way is made of stars but deliberately does not answer. Giovanni believes he held back out of sympathy. Echo this when the two meet again on the train.',
    },
    {
      summary: 'Customs of the Milky Way festival',
      content:
        'On the night of the Milky Way (Centaur) festival the town hangs balls of yew leaves and lights cypress branches, and the children float blue snake-gourd lanterns down the river.',
    },
  ],
};

/** 助手面板里的一段演示对话 */
export const DEMO_CHAT: Localized<{
  title: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}> = {
  'zh-CN': {
    title: '「銀河」和「天の川」怎么区分',
    messages: [
      {
        role: 'user',
        content: '这一章里「銀河」和「天の川」交替出现，译文需要区分吗？',
      },
      {
        role: 'assistant',
        content:
          '建议区分。老师讲课时的「銀河」是科学用语，译作**银河**；而「天の川」出现在把它比作河流的句子里（河底的沙粒、河水），译作**天河**更能保留这层比喻。\n\n我查了术语表，这两个词都已有记录，本章 17 段的译文也都符合这个规则。',
      },
      { role: 'user', content: '好，把这条规则记到记忆里，后面的章节也照这样翻。' },
      {
        role: 'assistant',
        content:
          '已保存为记忆「銀河」与「天の川」的译法。之后翻译、润色和校对时，相关段落会自动带上这条记忆。',
      },
    ],
  },
  'zh-TW': {
    title: '「銀河」和「天の川」怎麼區分',
    messages: [
      {
        role: 'user',
        content: '這一章裡「銀河」和「天の川」交替出現，譯文需要區分嗎？',
      },
      {
        role: 'assistant',
        content:
          '建議區分。老師講課時的「銀河」是科學用語，譯作**銀河**；而「天の川」出現在把它比作河流的句子裡（河底的沙粒、河水），譯作**天河**更能保留這層比喻。\n\n我查了術語表，這兩個詞都已有紀錄，本章 17 段的譯文也都符合這個規則。',
      },
      { role: 'user', content: '好，把這條規則記到記憶裡，後面的章節也照這樣翻。' },
      {
        role: 'assistant',
        content:
          '已儲存為記憶「銀河」與「天の川」的譯法。之後翻譯、潤飾和校對時，相關段落會自動帶上這條記憶。',
      },
    ],
  },
  'en-US': {
    title: 'Telling 銀河 and 天の川 apart',
    messages: [
      {
        role: 'user',
        content:
          'This chapter alternates between 銀河 and 天の川. Should the translation keep them apart?',
      },
      {
        role: 'assistant',
        content:
          "I would keep them apart. 銀河 is the scientific term in the teacher's lesson, so **Milky Way** fits. 天の川 appears where it is pictured as a river (sand on the riverbed, the water), and **river of heaven** keeps that image.\n\nI checked the glossary: both terms are already recorded, and all 17 paragraphs in this chapter follow the rule.",
      },
      {
        role: 'user',
        content: 'Good. Save that as a memory so later chapters follow it too.',
      },
      {
        role: 'assistant',
        content:
          'Saved as the memory "Rendering 銀河 vs. 天の川". It will be included automatically whenever a related paragraph is translated, polished, or proofread.',
      },
    ],
  },
};

export interface DemoModel {
  name: string;
  provider: 'openai' | 'gemini' | 'anthropic';
  model: string;
  baseUrl: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  defaults: Array<'translation' | 'proofreading' | 'termsTranslation' | 'assistant'>;
}

/** 演示用模型配置：API Key 是占位符，不会发出任何请求 */
export const DEMO_MODELS: DemoModel[] = [
  {
    name: 'Gemini 4 Hydrogen',
    provider: 'gemini',
    model: 'gemini-4-hydrogen',
    baseUrl: '',
    maxInputTokens: 1_048_576,
    maxOutputTokens: 65_536,
    defaults: ['translation'],
  },
  {
    name: 'Claude Sonnet 5.5',
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    baseUrl: '',
    maxInputTokens: 1_000_000,
    maxOutputTokens: 128_000,
    defaults: ['proofreading', 'assistant'],
  },
  {
    name: 'GPT-5.6',
    provider: 'openai',
    model: 'gpt-5.6',
    baseUrl: 'https://api.openai.com/v1',
    maxInputTokens: 400_000,
    maxOutputTokens: 128_000,
    defaults: [],
  },
  {
    name: 'DeepSeek V4 Flash',
    provider: 'openai',
    model: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com/v1',
    maxInputTokens: 128_000,
    maxOutputTokens: 32_000,
    defaults: ['termsTranslation'],
  },
];
