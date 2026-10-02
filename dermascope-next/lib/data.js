export const CLASS_PROBS = [
  { label: 'Basal Cell', pct: 94.2 },
  { label: 'Melanoma', pct: 4.0 },
  { label: 'Melanocytic', pct: 1.3 },
  { label: 'Warts Molluscum', pct: 0.5 },
];

export const LOC_STATS = [
  { label: 'Area affected', value: '6.8%' },
  { label: 'Bounding box', value: '86,71–188,180' },
  { label: 'Grad-CAM agreement', value: 'IoU 0.71' },
  { label: 'Mask confidence', value: '0.88' },
];

export const QUEUE_THUMBS = [
  { id: 1, gradient: 'linear-gradient(135deg,#a9694c,#7c4230)' },
  { id: 2, gradient: 'linear-gradient(135deg,#b9795a,#8a5236)' },
  { id: 3, gradient: 'linear-gradient(135deg,#c68a68,#96603f)' },
];

export const HISTORY_ROWS = [
  { file: 'IMG_0421.jpg', gradient: 'linear-gradient(135deg,#a9694c,#7c4230)', tag: 'Basal Cell · 94%', area: '6.8% area', time: 'just now' },
  { file: 'IMG_0418.jpg', gradient: 'linear-gradient(135deg,#b9795a,#8a5236)', tag: 'Melanocytic · 88%', area: '4.1% area', time: '14 min ago' },
  { file: 'IMG_0402.jpg', gradient: 'linear-gradient(135deg,#c68a68,#96603f)', tag: 'Melanoma · 91%', area: '8.3% area', time: 'yesterday' },
  { file: 'IMG_0391.jpg', gradient: 'linear-gradient(135deg,#9c6246,#6b3f29)', tag: 'Warts Molluscum · 97%', area: '2.2% area', time: '3 days ago' },
];

export const HISTORY_FILTERS = ['All', 'Basal Cell', 'Melanoma', 'Melanocytic', 'Flagged'];

export const TREND_SERIES = {
  labels: ['Scan 1', 'Scan 2', 'Scan 3', 'Scan 4', 'Scan 5', 'Scan 6'],
  values: [4.1, 4.6, 5.0, 5.9, 6.2, 6.8],
};

export const LESIONS = [
  {
    id: 'forearm',
    name: 'Mole — right forearm',
    sub: '4 scans · last: today',
    status: 'alert',
    spark: [35, 42, 55, 100],
  },
  {
    id: 'shoulder',
    name: 'Spot — left shoulder',
    sub: '3 scans · last: 5 days ago',
    status: 'stable',
    spark: [48, 50, 52],
  },
  {
    id: 'back',
    name: 'Patch — upper back',
    sub: '2 scans · last: 2 weeks ago',
    status: 'monitor',
    spark: [40, 63],
  },
];

export const LESION_SCAN_HISTORY = [
  { date: 'Today', cls: 'Basal Cell Carcinoma', conf: '94.2%', area: '6.8%', delta: '+36% · class changed', deltaType: 'up' },
  { date: '9 days ago', cls: 'Melanocytic Nevi', conf: '81.0%', area: '5.0%', delta: '+9%', deltaType: 'up' },
  { date: '24 days ago', cls: 'Melanocytic Nevi', conf: '85.5%', area: '4.6%', delta: '+5%', deltaType: 'up' },
  { date: '41 days ago', cls: 'Melanocytic Nevi', conf: '88.2%', area: '4.1%', delta: 'baseline', deltaType: 'flat' },
];

export const MODEL_SPECS = [
  {
    name: 'Classification model',
    tag: 'EfficientNetV2S',
    desc: 'Transfer learning, staged fine-tuning (top 30% unfrozen), trained on 4 disease classes.',
    specs: [
      { label: 'Test accuracy', value: '95.0%' },
      { label: 'Macro F1', value: '0.96' },
      { label: 'Classes', value: '4' },
      { label: 'Dataset', value: 'Kaggle (29k img)' },
    ],
  },
  {
    name: 'Localization model',
    tag: 'U-Net + MobileNetV2',
    desc: 'Trained separately on a masked dermoscopic dataset; outputs a lesion mask, bounding box, and % area affected.',
    specs: [
      { label: 'Test Dice', value: '0.84' },
      { label: 'Test IoU', value: '0.76' },
      { label: 'Images', value: '900' },
      { label: 'Dataset', value: 'ISIC 2016' },
    ],
  },
];
