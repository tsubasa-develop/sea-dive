// 生物種データベース。現実の習性・生息深度・希少度をゲーム的に落とし込む。

export type Zone = 'reef' | 'open' | 'deep';
export type Mode = 'school' | 'solitary' | 'floor' | 'drift' | 'event' | 'anemone' | 'cave';
export type Builder =
  | 'fish' | 'ray' | 'turtle' | 'jelly' | 'comb' | 'angler'
  | 'oarfish' | 'isopod' | 'mendako' | 'octopus' | 'sunfish' | 'whale'
  | 'gardenEel' | 'clione' | 'squid' | 'shadow';

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
  tailFork?: number;  // 尾びれの二叉の深さ(0=丸尾, 1=深い二叉)
  dorsalH?: number;   // 背びれ高(体長比)
  analH?: number;
  noseK?: number;     // 吻の尖り(小=丸い)
  arch?: number;      // 背のアーチの強さ(0=紡錘形, 0.4=背が盛る)
  hump?: number;      // 額のコブ(ナポレオン)
  base: string;
  belly?: string;
  pattern?: PatternDef;
  finColor?: string;
  scales?: boolean;   // 鱗の質感(鯨類・エイはfalse)
  gillSlits?: boolean; // サメの鰓裂(エラ蓋の代わり)
  eyeColor?: string;  // 虹彩の色
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
  predator?: boolean;           // 襲撃イベント種(通常のイベント抽選から除外)
}

export const SPECIES: SpeciesDef[] = [
  // ─── サンゴ礁 (reef) ───
  {
    id: 'blue_damsel', name: 'ルリスズメダイ', rarity: 1, zone: 'reef',
    desc: 'サンゴの周りに群れる鮮やかなコバルトブルーの小魚。危険を感じると枝サンゴの隙間に隠れる。',
    depth: [2, 16], mode: 'school', groups: 5, groupSize: [14, 22],
    speed: 1.1, skittish: 0.45, length: 0.08, builder: 'fish',
    fish: { base: '#2b57ff', belly: '#6a97ff', height: 0.34, swimFreq: 9, eyeColor: '#3a3a60' },
  },
  {
    id: 'anthias', name: 'アカネハナゴイ', rarity: 1, zone: 'reef',
    desc: 'サンゴの根の上を茜色の吹雪のように舞う。数百匹の群れが潮の流れに向かって漂い、プランクトンを食べる。',
    depth: [2, 20], mode: 'school', groups: 4, groupSize: [14, 22],
    speed: 0.9, skittish: 0.4, length: 0.08, builder: 'fish',
    fish: { base: '#ff5f7e', belly: '#ffab8e', height: 0.36, dorsalH: 0.14, swimFreq: 8.5, finColor: '#ff8a9e', eyeColor: '#d8506a' },
  },
  {
    id: 'clownfish', name: 'カクレクマノミ', rarity: 1, zone: 'reef',
    desc: 'イソギンチャクと共生し、その毒に守られて暮らす。巣からは決して遠くへ離れない。',
    depth: [3, 14], mode: 'anemone', groups: 3, groupSize: [3, 5],
    speed: 0.7, skittish: 0.8, homebound: true, length: 0.1, builder: 'fish',
    fish: { base: '#ff7f2a', belly: '#ffa95e', height: 0.4, tailFork: 0.15, pattern: { kind: 'bands', color: '#f8f8ff', count: 3, width: 0.1, edge: true }, swimFreq: 8 },
  },
  {
    id: 'butterflyfish', name: 'チョウチョウウオ', rarity: 2, zone: 'reef',
    desc: '生涯同じ相手と連れ添うといわれ、ほとんどの時間をペアで行動する。サンゴのポリプを食べる。',
    depth: [3, 20], mode: 'school', groups: 4, groupSize: [2, 2],
    speed: 0.9, skittish: 0.55, length: 0.16, builder: 'fish',
    fish: { base: '#ffcf3d', belly: '#fff3cf', height: 0.52, width: 0.09, arch: 0.3, tailFork: 0.2, pattern: { kind: 'eyeband', color: '#15151a' }, swimFreq: 7 },
  },
  {
    id: 'yellow_tang', name: 'キイロハギ', rarity: 2, zone: 'reef',
    desc: '全身がレモン色の鮮やかなハギ。サンゴの間の藻類をついばみ、夜になると体色がくすんで岩陰で眠る。',
    depth: [3, 20], mode: 'school', groups: 3, groupSize: [3, 6],
    speed: 1.0, skittish: 0.5, length: 0.18, builder: 'fish',
    fish: { base: '#ffd400', belly: '#ffe870', height: 0.52, width: 0.08, arch: 0.32, noseK: 1.0, tailFork: 0.1, dorsalH: 0.2, analH: 0.16, swimFreq: 6.5, finColor: '#ffdf40' },
  },
  {
    id: 'blue_tang', name: 'ナンヨウハギ', rarity: 2, zone: 'reef',
    desc: '鮮やかな瑠璃色に黄色い尾。幼魚は枝サンゴの間を住処にする。警戒すると尾の棘を立てる。',
    depth: [3, 18], mode: 'school', groups: 3, groupSize: [5, 8],
    speed: 1.2, skittish: 0.5, length: 0.22, builder: 'fish',
    fish: { base: '#2b53d8', belly: '#3f6ce0', height: 0.5, width: 0.1, arch: 0.3, pattern: { kind: 'hstripe', color: '#0c1430' }, finColor: '#ffd23f', swimFreq: 6.5 },
  },
  {
    id: 'moorish_idol', name: 'ツノダシ', rarity: 2, zone: 'reef',
    desc: '白・黒・黄のコントラストと鎌のように伸びる背びれが優雅。小さな群れで礁を渡り歩く。',
    depth: [3, 22], mode: 'school', groups: 3, groupSize: [2, 3],
    speed: 1.0, skittish: 0.55, length: 0.18, builder: 'fish',
    fish: { base: '#f2ead6', belly: '#fff8e8', height: 0.55, width: 0.09, arch: 0.3, dorsalH: 0.5, pattern: { kind: 'bands', color: '#17171c', count: 2, width: 0.17 }, finColor: '#f5d24a', swimFreq: 7 },
  },
  {
    id: 'pennant_fish', name: 'ハタタテダイ', rarity: 2, zone: 'reef',
    desc: '旗を立てたように長く伸びる白い背びれが目印。ツノダシとよく間違われるが、より群れを好む。',
    depth: [3, 25], mode: 'school', groups: 2, groupSize: [4, 7],
    speed: 1.0, skittish: 0.5, length: 0.17, builder: 'fish',
    fish: { base: '#f8f4ea', belly: '#fffdf6', height: 0.56, width: 0.09, arch: 0.32, dorsalH: 0.62, pattern: { kind: 'bands', color: '#1a1a20', count: 2, width: 0.13 }, finColor: '#ffd85e', swimFreq: 7 },
  },
  {
    id: 'forceps_fish', name: 'フエヤッコダイ', rarity: 2, zone: 'reef',
    desc: 'ピンセットのように細長い口で、サンゴの隙間の小さな獲物をつまみ出す。レモン色の体が美しい。',
    depth: [4, 24], mode: 'school', groups: 2, groupSize: [2, 2],
    speed: 0.85, skittish: 0.6, length: 0.15, builder: 'fish',
    fish: { base: '#ffcf28', belly: '#ffe9a0', height: 0.46, width: 0.08, arch: 0.3, noseK: 1.45, tailFork: 0.2, dorsalH: 0.2, analH: 0.18, swimFreq: 7 },
  },
  {
    id: 'yellow_snapper', name: 'ヨスジフエダイ', rarity: 1, zone: 'reef',
    desc: '青い縦帯が入った黄色い魚。昼間は大きな群れで根の周りに静止し、夜になると散って狩りをする。',
    depth: [4, 30], mode: 'school', groups: 2, groupSize: [16, 26],
    speed: 1.1, skittish: 0.45, length: 0.28, builder: 'fish',
    fish: { base: '#ffc93a', belly: '#fff0b8', height: 0.34, arch: 0.24, pattern: { kind: 'hstripe', color: '#4a9adf' }, swimFreq: 5.5, eyeColor: '#e8b830' },
  },
  {
    id: 'fusilier', name: 'ウメイロモドキ', rarity: 2, zone: 'reef',
    desc: '背中の黄色と体の青のツートンが鮮烈。中層を高速で流れるように群泳し、礁と外洋を行き来する。',
    depth: [5, 35], mode: 'school', groups: 2, groupSize: [20, 30],
    speed: 1.8, skittish: 0.5, length: 0.25, builder: 'fish',
    fish: { base: '#3a7ad8', belly: '#cfe4f0', height: 0.26, tailFork: 0.8, pattern: { kind: 'hstripe', color: '#ffd83a' }, swimFreq: 7, metalness: 0.3, roughness: 0.4 },
  },
  {
    id: 'cleaner_wrasse', name: 'ホンソメワケベラ', rarity: 2, zone: 'reef',
    desc: '大きな魚の体を掃除する「海のクリーニング屋」。青い体の黒い縦線が目印で、大型魚も彼らは襲わない。',
    depth: [3, 25], mode: 'school', groups: 3, groupSize: [2, 3],
    speed: 0.9, skittish: 0.35, length: 0.09, builder: 'fish',
    fish: { base: '#9fd0f0', belly: '#e8f4fa', height: 0.22, width: 0.08, pattern: { kind: 'hstripe', color: '#101418' }, swimFreq: 8 },
  },
  {
    id: 'squirrelfish', name: 'アカマツカサ', rarity: 2, zone: 'reef',
    desc: '深紅の体と大きな目を持つ夜行性の魚。昼間は岩棚やサンゴの陰に隠れてじっとしている。',
    depth: [5, 30], mode: 'school', groups: 2, groupSize: [4, 7],
    speed: 0.8, skittish: 0.65, length: 0.2, builder: 'fish',
    fish: { base: '#e83a30', belly: '#ff9a80', height: 0.36, arch: 0.26, eyeScale: 1.5, pattern: { kind: 'hstripe', color: '#ffffff' }, swimFreq: 6, eyeColor: '#801818' },
  },
  {
    id: 'boxfish', name: 'ミナミハコフグ', rarity: 3, zone: 'reef',
    desc: '骨板の箱に入ったような四角い体。幼魚はサイコロのように黄色一色で、水玉模様がかわいい人気者。',
    depth: [3, 20], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.4, skittish: 0.5, length: 0.14, builder: 'fish',
    fish: { base: '#ffce20', belly: '#ffe480', height: 0.52, width: 0.46, noseK: 0.42, tailFork: 0, tailLen: 0.3, pattern: { kind: 'spots', color: '#14181e' }, swimFreq: 5, swimMode: 'waggle' },
  },
  {
    id: 'porcupinefish', name: 'ハリセンボン', rarity: 3, zone: 'reef',
    desc: '危険を感じると水を飲んで棘だらけの風船になる。大きな目と間の抜けた顔で、意外と人懐こい。',
    depth: [3, 25], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.5, skittish: 0.35, curious: true, length: 0.32, builder: 'fish',
    fish: { base: '#c8b380', belly: '#f0e8c8', height: 0.44, width: 0.4, noseK: 0.4, tailFork: 0, eyeScale: 1.4, pattern: { kind: 'spots', color: '#3a3428' }, swimFreq: 4.5 },
  },
  {
    id: 'lionfish', name: 'ハナミノカサゴ', rarity: 3, zone: 'reef',
    desc: '毒棘を持つため天敵が少なく、悠然と泳ぐ。岩陰やサンゴの隙間を好み、夕暮れに狩りをする。',
    depth: [4, 24], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.35, skittish: 0.15, length: 0.32, builder: 'fish',
    fish: { base: '#a24a3c', belly: '#d8b9a8', height: 0.42, width: 0.18, lionfins: true, pattern: { kind: 'bands', color: '#efe0d0', count: 11, width: 0.035 }, finColor: '#b97a68', swimFreq: 4 },
  },
  {
    id: 'parrotfish', name: 'ナンヨウブダイ', rarity: 3, zone: 'reef',
    desc: 'くちばし状の歯でサンゴをかじり、砂を排出する「砂の生産者」。夜は粘液の寝袋を作って眠る。',
    depth: [3, 25], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.8, skittish: 0.4, length: 0.5, builder: 'fish',
    fish: { base: '#2ab4a4', belly: '#8ce0cc', height: 0.38, arch: 0.28, noseK: 0.5, pattern: { kind: 'speckle', color: '#e87a9a' }, finColor: '#40c8b8', swimFreq: 4, eyeColor: '#308878' },
  },
  {
    id: 'cornetfish', name: 'アオヤガラ', rarity: 3, zone: 'reef',
    desc: '矢のように細長い体で、他の魚の陰に隠れて獲物に忍び寄る。海面近くを漂う姿は流木と見分けがつかない。',
    depth: [3, 30], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.9, skittish: 0.45, length: 1.2, builder: 'fish',
    fish: { base: '#7aa8a0', belly: '#c8ded8', height: 0.07, width: 0.05, noseK: 1.5, tailSpan: 0.12, tailLen: 0.3, swimFreq: 3, eyeX: 0.2 },
  },
  {
    id: 'moray', name: 'ドクウツボ', rarity: 3, zone: 'reef',
    desc: '岩穴から頭だけを出して獲物を待つ。鋭い歯と2mを超える巨体だが、こちらから手を出さなければ大人しい。',
    depth: [4, 30], mode: 'floor', groups: 2, groupSize: [1, 1],
    speed: 0.35, skittish: 0.25, length: 1.9, builder: 'fish',
    fish: { base: '#6a6444', belly: '#8a8460', height: 0.13, width: 0.09, noseK: 0.6, tailSpan: 0.05, tailLen: 0.1, dorsalH: 0.03, scales: false, pattern: { kind: 'speckle', color: '#3a3628' }, swimFreq: 2.2, swimAmp: 0.2, eyeColor: '#c8b820' },
  },
  {
    id: 'garden_eel', name: 'チンアナゴ', rarity: 3, zone: 'reef',
    desc: '砂地から体を半分出して潮に漂うプランクトンを食べる。近づくとするすると砂に引っ込んでしまう。',
    depth: [5, 25], mode: 'floor', groups: 3, groupSize: [1, 1],
    speed: 0.01, skittish: 0, length: 0.35, builder: 'gardenEel',
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
    id: 'whitetip_shark', name: 'ネムリブカ', rarity: 3, zone: 'reef',
    desc: '昼間は岩棚の下で「眠る」おとなしいサメ。背びれの白い先端が目印で、礁のダイバーには馴染み深い。',
    depth: [6, 35], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 1.1, skittish: 0.25, length: 1.5, builder: 'fish',
    fish: { base: '#7a848c', belly: '#dfe6ea', height: 0.2, width: 0.14, gillSlits: true, scales: false, dorsalH: 0.14, tailFork: 0.9, tailSpan: 0.42, finColor: '#e8eef0', swimFreq: 2.8, eyeScale: 0.6 },
  },
  {
    id: 'napoleon', name: 'メガネモチノウオ', rarity: 4, zone: 'reef',
    desc: '通称ナポレオンフィッシュ。額の大きなコブが特徴の巨大なベラ。礁の外縁を単独で回遊する。',
    depth: [8, 30], mode: 'solitary', groups: 1, groupSize: [1, 1],
    speed: 0.8, skittish: 0.2, curious: true, length: 1.7, builder: 'fish',
    fish: { base: '#3e7f66', belly: '#9fd0a8', height: 0.42, width: 0.2, noseK: 0.5, hump: 0.5, arch: 0.26, pattern: { kind: 'bands', color: '#2b5f4e', count: 9, width: 0.03 }, swimFreq: 2.2, eyeColor: '#2a5848' },
  },
  // ─── 外洋・ドロップオフ (open) ───
  {
    id: 'moon_jelly', name: 'ミズクラゲ', rarity: 1, zone: 'open',
    desc: '四つ葉のような生殖腺が透けて見える。自力ではほとんど泳がず、潮の流れに身を任せて漂う。',
    depth: [2, 32], mode: 'drift', groups: 14, groupSize: [1, 1],
    speed: 0.15, skittish: 0, length: 0.5, builder: 'jelly',
  },
  {
    id: 'sardine', name: 'イワシの大群', rarity: 1, zone: 'open',
    desc: '捕食者から身を守るため、巨大な群れで渦を巻く。光を反射して銀色の壁のようにうねる。',
    depth: [5, 35], mode: 'school', groups: 1, groupSize: [110, 110],
    speed: 2.0, skittish: 0.7, length: 0.16, builder: 'fish',
    fish: { base: '#8fa3b0', belly: '#e8f2f8', height: 0.22, width: 0.09, tailFork: 0.85, metalness: 0.45, roughness: 0.3, swimFreq: 10 },
  },
  {
    id: 'bigeye_trevally', name: 'ギンガメアジ', rarity: 2, zone: 'open',
    desc: '数百匹が円柱状に渦を巻く「ギンガメトルネード」で有名。銀の鎧のような群れが太陽を隠す。',
    depth: [8, 50], mode: 'school', groups: 1, groupSize: [40, 55],
    speed: 1.6, skittish: 0.4, length: 0.6, builder: 'fish',
    fish: { base: '#7a8a96', belly: '#d8e2e8', height: 0.32, arch: 0.26, tailFork: 0.85, metalness: 0.5, roughness: 0.3, swimFreq: 5, eyeScale: 1.2 },
  },
  {
    id: 'trevally', name: 'ロウニンアジ', rarity: 3, zone: 'open',
    desc: '体長1m近い大型のアジ。単独か少数でイワシの群れを追う、ドロップオフの狩人。',
    depth: [5, 45], mode: 'school', groups: 2, groupSize: [2, 3],
    speed: 2.8, skittish: 0.25, length: 0.9, builder: 'fish',
    fish: { base: '#5f6f7c', belly: '#cfd8de', height: 0.36, arch: 0.3, tailFork: 0.85, metalness: 0.4, roughness: 0.35, swimFreq: 4 },
  },
  {
    id: 'tuna', name: 'キハダマグロ', rarity: 3, zone: 'open',
    desc: '止まると呼吸ができないため、生涯泳ぎ続ける外洋の弾丸。黄色いひれを輝かせ群れで回遊する。',
    depth: [10, 60], mode: 'school', groups: 1, groupSize: [8, 12],
    speed: 3.4, skittish: 0.3, length: 1.4, builder: 'fish',
    fish: { base: '#3a4a66', belly: '#d0dce4', height: 0.26, width: 0.16, tailFork: 0.95, tailSpan: 0.4, dorsalH: 0.1, analH: 0.09, finColor: '#ffd020', metalness: 0.55, roughness: 0.25, swimFreq: 4.5, eyeScale: 0.8 },
  },
  {
    id: 'mahi', name: 'シイラ', rarity: 3, zone: 'open',
    desc: '金緑に輝く体と角ばった額。流れ藻につく小魚を追って海面近くを疾走する。興奮すると体色が明滅する。',
    depth: [2, 30], mode: 'school', groups: 1, groupSize: [2, 3],
    speed: 3.0, skittish: 0.3, length: 1.3, builder: 'fish',
    fish: { base: '#3aa860', belly: '#ffe084', height: 0.3, width: 0.1, noseK: 0.42, arch: 0.42, tailFork: 0.95, dorsalH: 0.16, pattern: { kind: 'speckle', color: '#2a6a8a' }, metalness: 0.5, roughness: 0.3, swimFreq: 4 },
  },
  {
    id: 'barracuda', name: 'オニカマス', rarity: 3, zone: 'open',
    desc: '銀色の魚雷のような体で、群れごと静止するように漂う。狙いを定めると一瞬で加速する。',
    depth: [8, 40], mode: 'school', groups: 1, groupSize: [6, 9],
    speed: 2.4, skittish: 0.3, length: 1.25, builder: 'fish',
    fish: { base: '#9fb0ba', belly: '#e2ebf0', height: 0.15, width: 0.09, noseK: 1.1, tailFork: 0.8, metalness: 0.5, roughness: 0.3, pattern: { kind: 'bands', color: '#46525c', count: 16, width: 0.02 }, swimFreq: 3.5 },
  },
  {
    id: 'sea_snake', name: 'エラブウミヘビ', rarity: 3, zone: 'open',
    desc: '青灰色に黒い環模様のウミヘビ。強い毒を持つが性格は温和。息継ぎのため定期的に海面へ上がる。',
    depth: [2, 30], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.8, skittish: 0.3, length: 1.2, builder: 'fish',
    fish: { base: '#8a9cb0', belly: '#c8d4dc', height: 0.055, width: 0.05, noseK: 0.5, tailSpan: 0.08, tailLen: 0.12, tailFork: 0, dorsalH: 0, analH: 0, scales: false, pattern: { kind: 'bands', color: '#22282e', count: 18, width: 0.025 }, swimFreq: 3, swimAmp: 0.14, eyeScale: 0.7 },
  },
  {
    id: 'eagle_ray', name: 'マダラトビエイ', rarity: 3, zone: 'open',
    desc: '背の白い斑点が星空のよう。翼のような胸びれを羽ばたかせ、海の中を"飛ぶ"。',
    depth: [10, 50], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 1.4, skittish: 0.35, length: 1.7, builder: 'ray',
    fish: { base: '#3c4a58', belly: '#e8eef2', width: 1.35, height: 0.1, scales: false, pattern: { kind: 'spots', color: '#dfe8ee' }, swimFreq: 1.6 },
  },
  {
    id: 'manta', name: 'オニイトマキエイ', rarity: 4, zone: 'open',
    desc: '翼幅6mを超える海の王者。プランクトンを求めて回遊し、時に宙返りしながら食事をする。',
    depth: [10, 60], mode: 'solitary', groups: 1, groupSize: [1, 1],
    speed: 1.6, skittish: 0.1, length: 3.6, builder: 'ray',
    fish: { base: '#20262e', belly: '#eef2f5', width: 1.75, height: 0.09, scales: false, swimFreq: 1.0 },
  },
  {
    id: 'hammerhead', name: 'アカシュモクザメ', rarity: 4, zone: 'open',
    desc: 'T字型の頭で獲物の微弱な電気を感じ取る。ドロップオフの断崖に沿って回遊する。',
    depth: [28, 70], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 1.8, skittish: 0.3, length: 2.4, builder: 'fish',
    fish: { base: '#7c8894', belly: '#e8ecef', height: 0.2, width: 0.13, hammer: true, gillSlits: true, scales: false, dorsalH: 0.17, tailFork: 0.9, tailSpan: 0.44, swimFreq: 2.6, eyeScale: 0.5 },
  },
  {
    id: 'tiger_shark', name: 'イタチザメ', rarity: 4, zone: 'open',
    desc: '「海のゴミ箱」と呼ばれるほど何でも食べる大型のサメ。若い個体には虎縞が浮かぶ。単独で広い海を回遊する。',
    depth: [15, 80], mode: 'solitary', groups: 1, groupSize: [1, 1],
    speed: 1.6, skittish: 0.15, length: 3.4, builder: 'fish',
    fish: { base: '#5c6a74', belly: '#d8e0e4', height: 0.22, width: 0.16, gillSlits: true, scales: false, noseK: 0.5, dorsalH: 0.13, tailFork: 0.85, tailSpan: 0.42, pattern: { kind: 'bands', color: '#454f58', count: 12, width: 0.03 }, swimFreq: 2.2, eyeScale: 0.5 },
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
      base: '#8a99a6', belly: '#e6edf2', height: 0.24, width: 0.15, noseK: 0.85, scales: false,
      dorsalH: 0.1, flukeH: true, eyeScale: 0.55, eyeX: 0.09, swimFreq: 2.6, swimMode: 'vsway',
      roughness: 0.35, metalness: 0.2,
    },
  },
  {
    id: 'sailfish', name: 'バショウカジキ', rarity: 4, zone: 'open',
    desc: '海で最速といわれる魚。帆のような巨大な背びれを広げてイワシの群れを追い込む。',
    depth: [5, 45], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 4.5, skittish: 0.2, length: 2.5, builder: 'fish',
    fish: { base: '#3a5a8c', belly: '#cfdce8', height: 0.2, width: 0.1, noseK: 1.5, dorsalH: 0.34, tailFork: 0.95, tailSpan: 0.42, metalness: 0.45, roughness: 0.3, finColor: '#2a3f66', swimFreq: 3.5, eyeX: 0.22 },
    eventChance: 0.055, eventLine: '!! 銀の帆が風のように駆けていく…',
  },
  {
    id: 'humpback', name: 'ザトウクジラ', rarity: 5, zone: 'open',
    desc: '全長15m。複雑な「歌」を数十kmの彼方まで響かせる。長い胸びれをオールのように使い優雅に泳ぐ。',
    depth: [5, 45], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 1.6, skittish: 0, length: 13, builder: 'whale',
    eventChance: 0.045, eventLine: '!! 低く長い歌声が海に響いている…',
  },
  {
    id: 'blue_whale', name: 'シロナガスクジラ', rarity: 5, zone: 'open',
    desc: '地球史上最大の動物。全長24m、心臓だけで小型車ほどの重さがある。その巨体が視界を覆うと、人は自分の小ささを知る。',
    depth: [8, 60], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 2.0, skittish: 0, length: 24, builder: 'whale',
    eventChance: 0.03, eventLine: '!!! 海そのものが動いているような、途方もない気配…',
  },
  {
    id: 'whale_shark', name: 'ジンベエザメ', rarity: 5, zone: 'open',
    desc: '世界最大の魚類。巨体ながらプランクトンだけを食べる穏やかな巨人。出会えたら幸運。',
    depth: [8, 50], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 1.3, skittish: 0, length: 8.5, builder: 'fish',
    fish: { base: '#43596b', belly: '#dfe8ee', height: 0.24, width: 0.26, noseK: 0.4, gillSlits: true, scales: false, dorsalH: 0.1, tailSpan: 0.4, pattern: { kind: 'spots', color: '#e8f0f5' }, swimFreq: 1.1, eyeScale: 0.4 },
    eventChance: 0.05, eventLine: '!! 巨大な影がゆっくりと近づいてくる…',
  },
  {
    id: 'great_white', name: 'ホホジロザメ', rarity: 5, zone: 'open',
    desc: '海の食物連鎖の頂点。深みや沖に長居するダイバーの前に現れることがある。遭遇したら浅瀬へ逃げ込むしかない。',
    depth: [20, 999], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 3.0, skittish: 0, length: 4.8, builder: 'fish', predator: true,
    fish: { base: '#5a6670', belly: '#eef2f4', height: 0.26, width: 0.2, noseK: 0.62, gillSlits: true, scales: false, dorsalH: 0.16, tailFork: 0.75, tailSpan: 0.42, tailLen: 0.24, finColor: '#4a545c', swimFreq: 2.0, eyeScale: 0.45, eyeColor: '#141414' },
  },
  // ─── 深海 (deep) ───
  {
    id: 'lanternfish', name: 'ハダカイワシ', rarity: 2, zone: 'deep',
    desc: '腹部の発光器の並びで仲間を見分ける。夜には海面近くまで浮上する、深海で最も数の多い魚。',
    depth: [78, 130], mode: 'school', groups: 4, groupSize: [12, 18],
    speed: 1.0, skittish: 0.4, length: 0.1, builder: 'fish',
    fish: { base: '#3c4756', belly: '#8794a3', height: 0.28, emissiveDotsBelly: true, eyeScale: 1.3, swimFreq: 8 },
  },
  {
    id: 'firefly_squid', name: 'ホタルイカ', rarity: 3, zone: 'deep',
    desc: '青白い光の点で全身を飾る小さなイカ。外敵に襲われると発光でくらませて逃げる。',
    depth: [75, 130], mode: 'school', groups: 2, groupSize: [8, 14],
    speed: 0.6, skittish: 0.5, length: 0.07, builder: 'fish',
    fish: { base: '#2a3448', belly: '#4a5a78', height: 0.3, width: 0.2, noseK: 0.4, tailFork: 0, tailSpan: 0.16, dorsalH: 0, analH: 0, scales: false, emissiveDotsBelly: true, eyeScale: 1.6, swimFreq: 5 },
  },
  {
    id: 'comb_jelly', name: 'クシクラゲ', rarity: 3, zone: 'deep',
    desc: '体表の櫛板が光を回折し、虹色の光が波打って見える。自ら光っているわけではない。',
    depth: [72, 125], mode: 'drift', groups: 5, groupSize: [1, 1],
    speed: 0.1, skittish: 0, length: 0.25, builder: 'comb',
  },
  {
    id: 'clione', name: 'クリオネ', rarity: 3, zone: 'deep',
    desc: '「流氷の天使」と呼ばれる遊泳性の巻貝。羽のような翼足をはばたかせ、ゆっくりと宙を舞う。',
    depth: [70, 120], mode: 'drift', groups: 6, groupSize: [1, 1],
    speed: 0.12, skittish: 0, length: 0.08, builder: 'clione',
  },
  {
    id: 'giant_isopod', name: 'ダイオウグソクムシ', rarity: 3, zone: 'deep',
    desc: '海底に沈んだ生き物を食べる「深海の掃除屋」。何年も食べずに生きられ、ほとんど動かない。',
    depth: [95, 140], mode: 'floor', groups: 3, groupSize: [1, 1],
    speed: 0.12, skittish: 0.05, length: 0.45, builder: 'isopod',
  },
  {
    id: 'fangtooth', name: 'オニキンメ', rarity: 3, zone: 'deep',
    desc: '体に対する牙の比率は魚類最大級。見た目は恐ろしいが体長わずか15cmほどの小さな魚。',
    depth: [90, 140], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.4, skittish: 0.3, length: 0.16, builder: 'fish',
    fish: { base: '#1e181a', belly: '#302a2c', height: 0.42, width: 0.24, noseK: 0.45, tailFork: 0.4, eyeScale: 1.2, scales: false, swimFreq: 4, eyeColor: '#606878' },
  },
  {
    id: 'viperfish', name: 'ホウライエソ', rarity: 4, zone: 'deep',
    desc: '長い牙は口を閉じても収まらない。発光器で獲物を誘い、大きな口で丸呑みにする深海のハンター。',
    depth: [85, 140], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.5, skittish: 0.25, length: 0.35, builder: 'fish',
    fish: { base: '#182028', belly: '#28323c', height: 0.16, width: 0.1, noseK: 0.55, tailFork: 0.5, emissiveDotsBelly: true, scales: false, eyeScale: 1.3, swimFreq: 3.5, eyeColor: '#7a8898' },
  },
  {
    id: 'barreleye', name: 'デメニギス', rarity: 4, zone: 'deep',
    desc: '透明な頭の中に緑色の筒状の目を持つ。真上を通る獲物の影を、頭越しに見上げて狙う。',
    depth: [88, 135], mode: 'solitary', groups: 2, groupSize: [1, 1],
    speed: 0.25, skittish: 0.35, length: 0.15, builder: 'fish',
    fish: { base: '#26323e', belly: '#3c4a58', height: 0.34, width: 0.24, noseK: 0.4, tailFork: 0.3, eyeScale: 1.7, eyeX: 0.09, eyeColor: '#38c880', scales: false, swimFreq: 3 },
  },
  {
    id: 'chimaera', name: 'ギンザメ', rarity: 4, zone: 'deep',
    desc: 'サメと名がつくがサメではない古代魚の末裔。銀色の体と大きな胸びれで深海を滑空する。',
    depth: [90, 140], mode: 'solitary', groups: 1, groupSize: [1, 1],
    speed: 0.6, skittish: 0.4, length: 1.0, builder: 'fish',
    fish: { base: '#9aa8b4', belly: '#d8e0e6', height: 0.24, width: 0.14, noseK: 0.6, tailSpan: 0.1, tailLen: 0.4, tailFork: 0, dorsalH: 0.16, scales: false, metalness: 0.4, roughness: 0.35, eyeScale: 1.4, eyeColor: '#3a6858', swimFreq: 2 },
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
    id: 'gulper_eel', name: 'フクロウナギ', rarity: 4, zone: 'deep',
    desc: '体の大半を占める巨大な口で、まれに通りかかる獲物を袋のように飲み込む。尾の先は淡く光る。',
    depth: [95, 140], mode: 'solitary', groups: 1, groupSize: [1, 1],
    speed: 0.3, skittish: 0.2, length: 1.0, builder: 'fish',
    fish: { base: '#16141a', belly: '#241f28', height: 0.12, width: 0.07, noseK: 0.4, tailSpan: 0.04, tailLen: 0.1, tailFork: 0, dorsalH: 0, analH: 0, scales: false, swimFreq: 1.8, swimAmp: 0.12, eyeX: 0.03, eyeScale: 0.8 },
  },
  {
    id: 'goblin_shark', name: 'ミツクリザメ', rarity: 5, zone: 'deep',
    desc: '「深海の悪魔」の異名を持つ生きた化石。獲物を捕らえる瞬間、顎が飛び出す。桃色の肌は血管が透けた色。',
    depth: [95, 140], mode: 'solitary', groups: 1, groupSize: [1, 1],
    speed: 0.7, skittish: 0.2, length: 3.0, builder: 'fish',
    fish: { base: '#b08890', belly: '#d8b8bc', height: 0.18, width: 0.12, noseK: 1.3, gillSlits: true, scales: false, dorsalH: 0.08, tailFork: 0.3, tailSpan: 0.3, tailLen: 0.3, swimFreq: 1.8, eyeScale: 0.5, eyeX: 0.16 },
  },
  {
    id: 'frilled_shark', name: 'ラブカ', rarity: 5, zone: 'deep',
    desc: '古代のサメの姿を今に残す「生きる化石」。ウナギのような体で深海を漂い、300本の歯で獲物を逃さない。',
    depth: [95, 140], mode: 'solitary', groups: 1, groupSize: [1, 1],
    speed: 0.5, skittish: 0.3, length: 1.8, builder: 'fish',
    fish: { base: '#4a3f3a', belly: '#665a52', height: 0.1, width: 0.08, noseK: 0.5, gillSlits: true, scales: false, tailSpan: 0.1, tailLen: 0.2, tailFork: 0, dorsalH: 0.04, swimFreq: 2.2, swimAmp: 0.16, eyeScale: 0.9, eyeColor: '#68a880' },
  },
  {
    id: 'coelacanth', name: 'シーラカンス', rarity: 5, zone: 'deep',
    desc: '「生きた化石」。数億年前から姿を変えず、昼は海底洞窟に潜む。肉厚のひれで歩くように泳ぐ。',
    depth: [90, 140], mode: 'cave', groups: 1, groupSize: [1, 1],
    speed: 0.45, skittish: 0.35, length: 1.6, builder: 'fish',
    fish: { base: '#33475c', belly: '#4c6275', height: 0.32, width: 0.2, noseK: 0.5, tailFork: 0.1, pattern: { kind: 'speckle', color: '#cfd8de' }, swimFreq: 1.4, eyeColor: '#c8d868' },
  },
  {
    id: 'oarfish', name: 'リュウグウノツカイ', rarity: 5, zone: 'deep',
    desc: '全長10mを超えることもある伝説の深海魚。銀の体と紅のひれから「竜宮の使い」と呼ばれる。',
    depth: [80, 130], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 0.5, skittish: 0.2, length: 6.5, builder: 'oarfish',
    eventChance: 0.06, eventLine: '!! 深淵に、銀色の帯がゆらめいている…',
  },
  {
    id: 'giant_squid', name: 'ダイオウイカ', rarity: 5, zone: 'deep',
    desc: '触腕を含め10mを超える深海の伝説。生きた姿の撮影に成功したのは人類史上でも数えるほどしかない。',
    depth: [80, 140], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 0.9, skittish: 0.1, length: 10, builder: 'squid',
    eventChance: 0.04, eventLine: '!!! 巨大な腕が、闇の中でうごめいている…',
  },
  {
    id: 'nushi', name: '正体不明の巨大魚影', rarity: 5, zone: 'deep',
    desc: '「ヌシ」。深淵で目撃される全長40mを超える魚影。既知のどの生物とも一致しない。近づく者はいない。',
    depth: [70, 999], mode: 'event', groups: 0, groupSize: [1, 1],
    speed: 1.2, skittish: 0, length: 42, builder: 'shadow',
    eventChance: 0.022, eventLine: '!!! …山が、動いている。あれは何だ…',
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
