// 生物種データベース。現実の習性・生息深度・希少度をゲーム的に落とし込む。

export type Zone = 'reef' | 'open' | 'deep';
export type Mode = 'school' | 'solitary' | 'floor' | 'drift' | 'event' | 'anemone' | 'cave';
export type Builder =
  | 'fish' | 'ray' | 'turtle' | 'jelly' | 'comb' | 'angler'
  | 'oarfish' | 'isopod' | 'mendako' | 'octopus' | 'sunfish' | 'whale';

export interface PatternDef {
  kind: 'bands' | 'spots' | 'speckle' | 'eyeband' | 'hstripe';
  color?: string;
  count?: number;
  width?: number;   // bandsの太さ(0-1、体長比)
  edge?: boolean;   // bandsに黒縁を付ける(クマノミ)
}

export interface FishLook {
  height?: number;    // 体高(体長比) default 0.28
  width?: number;     // 体幅(体長比) default 0.13
  tailSpan?: number;  // 尾びれ幅(体長比)
  tailLen?: number;
  dorsalH?: number;   // 背びれ高(体長比)
  analH?: number;
  noseK?: number;     // 吻の尖り(小=丸い)
  hump?: number;      // 額のコブ(ナポレオン)
  base: string;
  belly?: string;
  pattern?: PatternDef;
  finColor?: string;
  emissiveDotsBelly?: boolean; // 発光器の列(ハダカイワシ)
  hammer?: boolean;
  lionfins?: boolean;
  flukeH?: boolean;   // 水平の尾びれ(鯨類)
  eyeScale?: number;  // 目の大きさ補正(大型種は小さく)
  eyeX?: number;      // 目の位置(体長比、頭=0)
  swimFreq?: number;
  swimAmp?: number;   // メートル。省略時 length*0.06
  swimMode?: 'sway' | 'flap' | 'waggle' | 'vsway'; // vsway=上下のうねり(鯨類)
  roughness?: number;
  metalness?: number;
}

export interface SpeciesDef {
  id: string;
  name: string;
  rarity: 1 | 2 | 3 | 4 | 5;
  zone: Zone;
  desc: string;
  depth: [number, number];      // 生息深度帯(m, 正値)
  mode: Mode;
  groups: number;               // 群れ or 個体の数
  groupSize: [number, number];
  speed: number;                // m/s
  skittish: number;             // 0-1 警戒心(逃げやすさ)
  curious?: boolean;            // プレイヤーに近寄ってくる
  homebound?: boolean;          // 危険時に巣へ逃げ込む(クマノミ)
  length: number;               // 体長(m)
  builder: Builder;
  fish?: FishLook;
  eventChance?: number;         // イベント種: 1ロールあたりの出現確率
  eventLine?: string;           // 出現時の演出テキスト
}

export const SPECIES: SpeciesDef[] = [
  // ─── サンゴ礁 (reef) ───
  {
    id: 'blue_damsel', name: 'ルリスズメダイ', rarity: 1, zone: 'reef',
    desc: 'サンゴの周りに群れる鮮やかなコバルトブルーの小魚。危険を感じると枝サンゴの隙間に隠れる。',
    depth: [2, 16], mode: 'school', groups: 3, groupSize: [10, 16],
    speed: 1.1, skittish: 0.45, length: 0.08, builder: 'fish',
    fish: { base: '#2b57ff', belly: '#6a97ff', height: 0.34, swimFreq: 9 },
  },
  {
    id: 'clownfish', name: 'カクレクマノミ', rarity: 1, zone: 'reef',
    desc: 'イソギンチャクと共生し、その毒に守られて暮らす。巣からは決して遠くへ離れない。',
    depth: [3, 14], mode: 'anemone', groups: 3, groupSize: [3, 5],
    speed: 0.7, skittish: 0.8, homebound: true, length: 0.1, builder: 'fish',
    fish: { base: '#ff7f2a', belly: '#ffa95e', height: 0.4, pattern: { kind: 'bands', color: '#f8f8ff', count: 3, width: 0.1, edge: true }, swimFreq: 8 },
  },
  {
    id: 'butterflyfish', name: 'チョウチョウウオ', rarity: 2, zone: 'reef',
    desc: '生涯同じ相手と連れ添うといわれ、ほとんどの時間をペアで行動する。サンゴのポリプを食べる。',
    depth: [3, 20], mode: 'school', groups: 4, groupSize: [2, 2],
    speed: 0.9, skittish: 0.55, length: 0.16, builder: 'fish',
    fish: { base: '#ffcf3d', belly: '#fff3cf', height: 0.52, width: 0.09, pattern: { kind: 'eyeband', color: '#15151a' }, swimFreq: 7 },
  },
  {
    id: 'blue_tang', name: 'ナンヨウハギ', rarity: 2, zone: 'reef',
    desc: '鮮やかな瑠璃色に黄色い尾。幼魚は枝サンゴの間を住処にする。警戒すると尾の棘を立てる。',
    depth: [3, 18], mode: 'school', groups: 2, groupSize: [5, 8],
    speed: 1.2, skittish: 0.5, length: 0.22, builder: 'fish',
    fish: { base: '#2b53d8', belly: '#3f6ce0', height: 0.5, width: 0.1, pattern: { kind: 'hstripe', color: '#0c1430' }, finColor: '#ffd23f', swimFreq: 6.5 },
  },
  {
    id: 'moorish_idol', name: 'ツノダシ', rarity: 2, zone: 'reef',
    desc: '白・黒・黄のコントラストと鎌のように伸びる背びれが優雅。小さな群れで礁を渡り歩く。',
    depth: [3, 22], mode: 'school', groups: 3, groupSize: [2, 3],
    speed: 1.0, skittish: 0.55, length: 0.18, builder: 'fish',
    fish: { base: '#f2ead6', belly: '#fff8e8', height: 0.55, width: 0.09, dorsalH: 0.5, pattern: { kind: 'bands', color: '#17171c', count: 2, width: 0.17 }, finColor: '#f5d24a', swimFreq: 7 },
  },
  {
    id: 'lionfish', name: 'ハナミノカサゴ', rarity: 3, zone: 'reef',
    desc: '毒棘を持つため天敵が少なく、悠然と泳ぐ。岩陰やサンゴの隙間を好み、夕暮れに狩りをする。',
    depth: [4, 24], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.35, skittish: 0.15, length: 0.32, builder: 'fish',
    fish: { base: '#a24a3c', belly: '#d8b9a8', height: 0.42, width: 0.18, lionfins: true, pattern: { kind: 'bands', color: '#efe0d0', count: 11, width: 0.035 }, finColor: '#b97a68', swimFreq: 4 },
  },
  {
    id: 'green_turtle', name: 'アオウミガメ', rarity: 3, zone: 'reef',
    desc: '海草や海藻を食べに浅瀬へやってくる。好奇心が強く、ダイバーを恐れずに近づいてくることも。',
    depth: [2, 26], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.9, skittish: 0.1, curious: true, length: 1.1, builder: 'turtle',
  },
  {
    id: 'octopus', name: 'ワモンダコ', rarity: 4, zone: 'reef',
    desc: '擬態の名人。皮膚の色と質感を瞬時に変え、岩と見分けがつかなくなる。よく探さないと出会えない。',
    depth: [4, 24], mode: 'floor', groups: 2, groupSize: [1, 1],
    speed: 0.3, skittish: 0.6, length: 0.6, builder: 'octopus',
  },
  {
    id: 'napoleon', name: 'メガネモチノウオ', rarity: 4, zone: 'reef',
    desc: '通称ナポレオンフィッシュ。額の大きなコブが特徴の巨大なベラ。礁の外縁を単独で回遊する。',
    depth: [8, 30], mode: 'solitary', groups: 1, groupSize: [1, 1],
    speed: 0.8, skittish: 0.2, curious: true, length: 1.7, builder: 'fish',
    fish: { base: '#3e7f66', belly: '#9fd0a8', height: 0.42, width: 0.2, noseK: 0.5, hump: 0.5, pattern: { kind: 'bands', color: '#2b5f4e', count: 9, width: 0.03 }, swimFreq: 2.2 },
  },
  // ─── 外洋・ドロップオフ (open) ───
  {
    id: 'moon_jelly', name: 'ミズクラゲ', rarity: 1, zone: 'open',
    desc: '四つ葉のような生殖腺が透けて見える。自力ではほとんど泳がず、潮の流れに身を任せて漂う。',
    depth: [2, 32], mode: 'drift', groups: 10, groupSize: [1, 1],
    speed: 0.15, skittish: 0, length: 0.5, builder: 'jelly',
  },
  {
    id: 'sardine', name: 'イワシの大群', rarity: 1, zone: 'open',
    desc: '捕食者から身を守るため、巨大な群れで渦を巻く。光を反射して銀色の壁のようにうねる。',
    depth: [5, 35], mode: 'school', groups: 1, groupSize: [80, 80],
    speed: 2.0, skittish: 0.7, length: 0.16, builder: 'fish',
    fish: { base: '#8fa3b0', belly: '#e8f2f8', height: 0.22, width: 0.09, metalness: 0.45, roughness: 0.3, swimFreq: 10 },
  },
  {
    id: 'trevally', name: 'ロウニンアジ', rarity: 3, zone: 'open',
    desc: '体長1m近い大型のアジ。単独か少数でイワシの群れを追う、ドロップオフの狩人。',
    depth: [5, 45], mode: 'school', groups: 2, groupSize: [2, 3],
    speed: 2.8, skittish: 0.25, length: 0.9, builder: 'fish',
    fish: { base: '#5f6f7c', belly: '#cfd8de', height: 0.36, width: 0.14, metalness: 0.4, roughness: 0.35, swimFreq: 4 },
  },
  {
    id: 'barracuda', name: 'オニカマス', rarity: 3, zone: 'open',
    desc: '銀色の魚雷のような体で、群れごと静止するように漂う。狙いを定めると一瞬で加速する。',
    depth: [8, 40], mode: 'school', groups: 1, groupSize: [6, 9],
    speed: 2.4, skittish: 0.3, length: 1.25, builder: 'fish',
    fish: { base: '#9fb0ba', belly: '#e2ebf0', height: 0.15, width: 0.09, noseK: 1.1, metalness: 0.5, roughness: 0.3, pattern: { kind: 'bands', color: '#46525c', count: 16, width: 0.02 }, swimFreq: 3.5 },
  },
  {
    id: 'eagle_ray', name: 'マダラトビエイ', rarity: 3, zone: 'open',
    desc: '背の白い斑点が星空のよう。翼のような胸びれを羽ばたかせ、海の中を"飛ぶ"。',
    depth: [10, 50], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 1.4, skittish: 0.35, length: 1.7, builder: 'ray',
    fish: { base: '#3c4a58', belly: '#e8eef2', width: 1.35, height: 0.1, pattern: { kind: 'spots', color: '#dfe8ee' }, swimFreq: 1.6 },
  },
  {
    id: 'manta', name: 'オニイトマキエイ', rarity: 4, zone: 'open',
    desc: '翼幅6mを超える海の王者。プランクトンを求めて回遊し、時に宙返りしながら食事をする。',
    depth: [10, 60], mode: 'solitary', groups: 1, groupSize: [1, 1],
    speed: 1.6, skittish: 0.1, length: 3.6, builder: 'ray',
    fish: { base: '#20262e', belly: '#eef2f5', width: 1.75, height: 0.09, swimFreq: 1.0 },
  },
  {
    id: 'hammerhead', name: 'アカシュモクザメ', rarity: 4, zone: 'open',
    desc: 'T字型の頭で獲物の微弱な電気を感じ取る。ドロップオフの断崖に沿って回遊する。',
    depth: [28, 70], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 1.8, skittish: 0.3, length: 2.4, builder: 'fish',
    fish: { base: '#7c8894', belly: '#e8ecef', height: 0.2, width: 0.13, hammer: true, dorsalH: 0.17, swimFreq: 2.6 },
  },
  {
    id: 'mola', name: 'マンボウ', rarity: 4, zone: 'open',
    desc: '深海でクラゲを食べ、体を温めに浅場へ上がってくる。横倒しで日光浴をする姿も目撃される。',
    depth: [15, 60], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 0.7, skittish: 0.15, length: 2.2, builder: 'sunfish',
    eventChance: 0.07, eventLine: 'のんびりと漂う大きな影…',
  },
  {
    id: 'dolphin', name: 'ミナミハンドウイルカ', rarity: 3, zone: 'open',
    desc: '好奇心旺盛で群れで行動し、ダイバーと並んで泳ぐことも。尾びれを上下に振って高速で泳ぐ。',
    depth: [1, 20], mode: 'school', groups: 1, groupSize: [4, 6],
    speed: 3.2, skittish: 0.1, length: 2.4, builder: 'fish',
    fish: {
      base: '#8a99a6', belly: '#e6edf2', height: 0.24, width: 0.15, noseK: 0.85,
      dorsalH: 0.1, flukeH: true, eyeScale: 0.55, eyeX: 0.09, swimFreq: 2.6, swimMode: 'vsway',
      roughness: 0.35, metalness: 0.2,
    },
  },
  {
    id: 'humpback', name: 'ザトウクジラ', rarity: 5, zone: 'open',
    desc: '全長15m。複雑な「歌」を数十kmの彼方まで響かせる。長い胸びれをオールのように使い優雅に泳ぐ。',
    depth: [5, 45], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 1.6, skittish: 0, length: 13, builder: 'whale',
    eventChance: 0.045, eventLine: '!! 低く長い歌声が海に響いている…',
  },
  {
    id: 'whale_shark', name: 'ジンベエザメ', rarity: 5, zone: 'open',
    desc: '世界最大の魚類。巨体ながらプランクトンだけを食べる穏やかな巨人。出会えたら幸運。',
    depth: [8, 50], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 1.3, skittish: 0, length: 8.5, builder: 'fish',
    fish: { base: '#43596b', belly: '#dfe8ee', height: 0.24, width: 0.26, noseK: 0.4, dorsalH: 0.1, pattern: { kind: 'spots', color: '#e8f0f5' }, swimFreq: 1.1 },
    eventChance: 0.05, eventLine: '!! 巨大な影がゆっくりと近づいてくる…',
  },
  // ─── 深海 (deep) ───
  {
    id: 'lanternfish', name: 'ハダカイワシ', rarity: 2, zone: 'deep',
    desc: '腹部の発光器の並びで仲間を見分ける。夜には海面近くまで浮上する、深海で最も数の多い魚。',
    depth: [78, 130], mode: 'school', groups: 3, groupSize: [10, 16],
    speed: 1.0, skittish: 0.4, length: 0.1, builder: 'fish',
    fish: { base: '#3c4756', belly: '#8794a3', height: 0.28, emissiveDotsBelly: true, swimFreq: 8 },
  },
  {
    id: 'comb_jelly', name: 'クシクラゲ', rarity: 3, zone: 'deep',
    desc: '体表の櫛板が光を回折し、虹色の光が波打って見える。自ら光っているわけではない。',
    depth: [72, 125], mode: 'drift', groups: 5, groupSize: [1, 1],
    speed: 0.1, skittish: 0, length: 0.25, builder: 'comb',
  },
  {
    id: 'giant_isopod', name: 'ダイオウグソクムシ', rarity: 3, zone: 'deep',
    desc: '海底に沈んだ生き物を食べる「深海の掃除屋」。何年も食べずに生きられ、ほとんど動かない。',
    depth: [95, 140], mode: 'floor', groups: 3, groupSize: [1, 1],
    speed: 0.12, skittish: 0.05, length: 0.45, builder: 'isopod',
  },
  {
    id: 'anglerfish', name: 'チョウチンアンコウ', rarity: 4, zone: 'deep',
    desc: '額から伸びる発光する疑似餌で獲物を誘い込む。光のない世界で獲物を待ち続ける。',
    depth: [88, 135], mode: 'solitary', groups: 1, groupSize: [1, 1],
    speed: 0.3, skittish: 0.2, length: 0.55, builder: 'angler',
  },
  {
    id: 'mendako', name: 'メンダコ', rarity: 4, zone: 'deep',
    desc: '耳のようなヒレでふわふわと浮遊する深海のアイドル。非常に臆病で、驚くと墨も吐かずに逃げる。',
    depth: [95, 140], mode: 'floor', groups: 1, groupSize: [1, 1],
    speed: 0.25, skittish: 0.9, length: 0.3, builder: 'mendako',
  },
  {
    id: 'coelacanth', name: 'シーラカンス', rarity: 5, zone: 'deep',
    desc: '「生きた化石」。数億年前から姿を変えず、昼は海底洞窟に潜む。肉厚のひれで歩くように泳ぐ。',
    depth: [90, 140], mode: 'cave', groups: 1, groupSize: [1, 1],
    speed: 0.45, skittish: 0.35, length: 1.6, builder: 'fish',
    fish: { base: '#33475c', belly: '#4c6275', height: 0.32, width: 0.2, noseK: 0.5, pattern: { kind: 'speckle', color: '#cfd8de' }, swimFreq: 1.4 },
  },
  {
    id: 'oarfish', name: 'リュウグウノツカイ', rarity: 5, zone: 'deep',
    desc: '全長10mを超えることもある伝説の深海魚。銀の体と紅のひれから「竜宮の使い」と呼ばれる。',
    depth: [80, 130], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 0.5, skittish: 0.2, length: 6.5, builder: 'oarfish',
    eventChance: 0.06, eventLine: '!! 深淵に、銀色の帯がゆらめいている…',
  },
];

export const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

/** ゾーンごとの水平分布(中心からの距離帯) */
export const ZONE_RADIUS: Record<Zone, [number, number]> = {
  reef: [12, 100],
  open: [95, 175],
  deep: [160, 250],
};

export const ZONE_LABEL: Record<Zone, string> = {
  reef: 'サンゴ礁',
  open: '外洋・ドロップオフ',
  deep: '深海',
};

export function rarityStars(r: number): string {
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}
