(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UIData = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FLAT_UI = [
    {
      name: '默认',
      en: 'Default',
      colors: [
        { name: 'Turquoise', hex: '#1abc9c' }, { name: 'Green Sea', hex: '#16a085' },
        { name: 'Emerald', hex: '#2ecc71' }, { name: 'Nephritis', hex: '#27ae60' },
        { name: 'Peter River', hex: '#3498db' }, { name: 'Belize Hole', hex: '#2980b9' },
        { name: 'Amethyst', hex: '#9b59b6' }, { name: 'Wisteria', hex: '#8e44ad' },
        { name: 'Wet Asphalt', hex: '#34495e' }, { name: 'Midnight Blue', hex: '#2c3e50' },
        { name: 'Sun Flower', hex: '#f1c40f' }, { name: 'Orange', hex: '#f39c12' },
        { name: 'Carrot', hex: '#e67e22' }, { name: 'Pumpkin', hex: '#d35400' },
        { name: 'Alizarin', hex: '#e74c3c' }, { name: 'Pomegranate', hex: '#c0392b' },
        { name: 'Clouds', hex: '#ecf0f1' }, { name: 'Silver', hex: '#bdc3c7' },
        { name: 'Concrete', hex: '#95a5a6' }, { name: 'Asbestos', hex: '#7f8c8d' }
      ]
    },
    {
      name: '中国',
      en: 'Chinese',
      colors: [
        { name: 'Golden Sand', hex: '#eccc68' }, { name: 'Warm Yellow', hex: '#ffa502' },
        { name: 'Coral', hex: '#ff7f50' }, { name: 'Bruschetta Tomato', hex: '#ff6348' },
        { name: 'Wild Watermelon', hex: '#ff6b81' }, { name: 'Watermelon', hex: '#ff4757' },
        { name: 'Peace', hex: '#a4b0be' }, { name: 'Grisaille', hex: '#57606f' },
        { name: 'Prestige Blue', hex: '#2f3542' }, { name: 'Twinkle Blue', hex: '#747d8c' },
        { name: 'Lime Soap', hex: '#7bed9f' }, { name: 'Ufo Green', hex: '#2ed573' },
        { name: 'French Sky Blue', hex: '#70a1ff' }, { name: 'Clear Chill', hex: '#1e90ff' },
        { name: 'Saturated Sky', hex: '#5352ed' }, { name: 'Bright Greek', hex: '#3742fa' },
        { name: 'White', hex: '#ffffff' }, { name: 'Anti-Flash White', hex: '#f1f2f6' },
        { name: 'City Lights', hex: '#dfe4ea' }, { name: 'Bay Wharf', hex: '#ced6e0' }
      ]
    },
    {
      name: '美国',
      en: 'American',
      colors: [
        { name: 'Light Greenish Blue', hex: '#55efc4' }, { name: 'Mint Leaf', hex: '#00b894' },
        { name: 'Faded Poster', hex: '#81ecec' }, { name: "Robin's Egg Blue", hex: '#00cec9' },
        { name: 'Green Darner Tail', hex: '#74b9ff' }, { name: 'Electron Blue', hex: '#0984e3' },
        { name: 'Shy Moment', hex: '#a29bfe' }, { name: 'Exodus Fruit', hex: '#6c5ce7' },
        { name: 'City Lights', hex: '#dfe6e9' }, { name: 'Soothing Breeze', hex: '#b2bec3' },
        { name: 'Sour Lemon', hex: '#ffeaa7' }, { name: 'Bright Yarrow', hex: '#fdcb6e' },
        { name: 'First Date', hex: '#fab1a0' }, { name: 'Orangeville', hex: '#e17055' },
        { name: 'Pink Glamour', hex: '#ff7675' }, { name: 'Chi-Gong', hex: '#d63031' },
        { name: 'Pico-8 Pink', hex: '#fd79a8' }, { name: 'Prunus Avium', hex: '#e84393' },
        { name: 'American River', hex: '#636e72' }, { name: 'Dracula Orchid', hex: '#2d3436' }
      ]
    },
    {
      name: '澳大利亚',
      en: 'Aussie',
      colors: [
        { name: 'Beekeeper', hex: '#f6e58d' }, { name: 'Turbo', hex: '#f9ca24' },
        { name: 'Spiced Nectarine', hex: '#ffbe76' }, { name: 'Quince Jelly', hex: '#f0932b' },
        { name: 'Pink Glamour', hex: '#ff7979' }, { name: 'Carmine Pink', hex: '#eb4d4b' },
        { name: 'June Bud', hex: '#badc58' }, { name: 'Pure Apple', hex: '#6ab04c' },
        { name: 'Coastal Breeze', hex: '#dff9fb' }, { name: 'Hint of Ice Pack', hex: '#c7ecee' },
        { name: 'Middle Blue', hex: '#7ed6df' }, { name: 'Greenland Green', hex: '#22a6b3' },
        { name: 'Heliotrope', hex: '#e056fd' }, { name: 'Steel Pink', hex: '#be2edd' },
        { name: 'Exodus Fruit', hex: '#686de0' }, { name: 'Blurple', hex: '#4834d4' },
        { name: 'Deep Koamaru', hex: '#30336b' }, { name: 'Deep Cove', hex: '#130f40' },
        { name: 'Soaring Eagle', hex: '#95afc0' }, { name: 'Wizard Grey', hex: '#535c68' }
      ]
    },
    {
      name: '英国',
      en: 'British',
      colors: [
        { name: 'Protoss Pylon', hex: '#00a8ff' }, { name: 'Vanadyl Blue', hex: '#0097e6' },
        { name: 'Periwinkle', hex: '#9c88ff' }, { name: 'Matt Purple', hex: '#8c7ae6' },
        { name: 'Rise-N-Shine', hex: '#fbc531' }, { name: 'Nanohanacha Gold', hex: '#e1b12c' },
        { name: 'Download Progress', hex: '#4cd137' }, { name: 'Skirret Green', hex: '#44bd32' },
        { name: 'Seabrook', hex: '#487eb0' }, { name: 'Naval', hex: '#40739e' },
        { name: 'Nasturcian Flower', hex: '#e84118' }, { name: 'Harley Davidson Orange', hex: '#c23616' },
        { name: 'Lynx White', hex: '#f5f6fa' }, { name: 'Hint of Pensive', hex: '#dcdde1' },
        { name: 'Blueberry Soda', hex: '#7f8fa6' }, { name: 'Chain Gang Grey', hex: '#718093' },
        { name: 'Mazarine Blue', hex: '#273c75' }, { name: 'Pico Void', hex: '#192a56' },
        { name: 'Blue Nights', hex: '#353b48' }, { name: 'Electromagnetic', hex: '#2f3640' }
      ]
    },
    {
      name: '加拿大',
      en: 'Canadian',
      colors: [
        { name: 'Jigglypuff', hex: '#ff9ff3' }, { name: 'Lian Hong Lotus Pink', hex: '#f368e0' },
        { name: 'Casandora Yellow', hex: '#feca57' }, { name: 'Double Dragon Skin', hex: '#ff9f43' },
        { name: 'Pastel Red', hex: '#ff6b6b' }, { name: 'Amour', hex: '#ee5253' },
        { name: 'Megaman', hex: '#48dbfb' }, { name: 'Cyanite', hex: '#0abde3' },
        { name: 'Wild Caribbean Green', hex: '#1dd1a1' }, { name: 'Dark Mountain Meadow', hex: '#10ac84' },
        { name: 'Jade Dust', hex: '#00d2d3' }, { name: 'Aqua Velvet', hex: '#01a3a4' },
        { name: 'Joust Blue', hex: '#54a0ff' }, { name: 'Bleu De France', hex: '#2e86de' },
        { name: 'Nasu Purple', hex: '#5f27cd' }, { name: 'Bluebell', hex: '#341f97' },
        { name: 'Light Blue Ballerina', hex: '#c8d6e5' }, { name: 'Fuel Town', hex: '#576574' },
        { name: 'Imperial Primer', hex: '#222f3e' }, { name: 'Storm Petrel', hex: '#8395a7' }
      ]
    },
    {
      name: '荷兰',
      en: 'Dutch',
      colors: [
        { name: 'Sunflower', hex: '#ffc312' }, { name: 'Radiant Yellow', hex: '#f79f1f' },
        { name: 'Puffins Bill', hex: '#ee5a24' }, { name: 'Red Pigment', hex: '#ea2027' },
        { name: 'Energos', hex: '#c4e538' }, { name: 'Android Green', hex: '#a3cb38' },
        { name: 'Pixelated Grass', hex: '#009432' }, { name: 'Turkish Aqua', hex: '#006266' },
        { name: 'Blue Martina', hex: '#12cbc4' }, { name: 'Mediterranean Sea', hex: '#1289a7' },
        { name: 'Merchant Marine Blue', hex: '#0652dd' }, { name: '20000 Leagues Under The Sea', hex: '#1b1464' },
        { name: 'Lavender Rose', hex: '#fda7df' }, { name: 'Lavender Tea', hex: '#d980fa' },
        { name: 'Forgotten Purple', hex: '#9980fa' }, { name: 'Circumorbital Ring', hex: '#5758bb' },
        { name: 'Bara Red', hex: '#ed4c67' }, { name: 'Very Berry', hex: '#b53471' },
        { name: 'Hollyhock', hex: '#833471' }, { name: 'Magenta Purple', hex: '#6f1e51' }
      ]
    },
    {
      name: '法国',
      en: 'French',
      colors: [
        { name: 'Flat Flesh', hex: '#fad390' }, { name: 'Squash Blossom', hex: '#f6b93b' },
        { name: 'Iceland Poppy', hex: '#fa983a' }, { name: 'Carrot Orange', hex: '#e58e26' },
        { name: 'Melon Melody', hex: '#f8c291' }, { name: 'Mandarin Red', hex: '#e55039' },
        { name: 'Tomato Red', hex: '#eb2f06' }, { name: 'Jalapeno Red', hex: '#b71540' },
        { name: 'Livid', hex: '#6a89cc' }, { name: 'Azraq Blue', hex: '#4a69bd' },
        { name: 'Yue Guang Lan Blue', hex: '#1e3799' }, { name: 'Dark Sapphire', hex: '#0c2461' },
        { name: 'Spray', hex: '#82ccdd' }, { name: 'Dupain', hex: '#60a3bc' },
        { name: 'Good Samaritan', hex: '#3c6382' }, { name: 'Forest Blues', hex: '#0a3d62' },
        { name: 'Paradise Green', hex: '#b8e994' }, { name: 'Aurora Green', hex: '#78e08f' },
        { name: 'Waterfall', hex: '#38ada9' }, { name: 'Reef Encounter', hex: '#079992' }
      ]
    }
  ];

  const FLUENT_DESIGN = [
    {
      name: '主题蓝 Brand',
      colors: [
        { name: 'Theme Darker', hex: '#004578' },
        { name: 'Theme Dark', hex: '#005a9e' },
        { name: 'Theme Dark Alt', hex: '#106ebe' },
        { name: 'Theme Primary', hex: '#0078d4' },
        { name: 'Theme Secondary', hex: '#2b88d8' },
        { name: 'Theme Tertiary', hex: '#71afe5' },
        { name: 'Theme Light', hex: '#c7e0f4' },
        { name: 'Theme Lighter', hex: '#deecf9' },
        { name: 'Theme Lighter Alt', hex: '#eff6fc' }
      ]
    },
    {
      name: '中性灰 Neutral',
      colors: [
        { name: 'Black', hex: '#000000' },
        { name: 'Neutral Dark', hex: '#201f1e' },
        { name: 'Neutral Primary', hex: '#323130' },
        { name: 'Neutral Secondary', hex: '#605e5c' },
        { name: 'Neutral Tertiary', hex: '#a19f9d' },
        { name: 'Neutral Light', hex: '#edebe9' },
        { name: 'Neutral Lighter', hex: '#f3f2f1' },
        { name: 'Neutral Lighter Alt', hex: '#faf9f8' },
        { name: 'White', hex: '#ffffff' }
      ]
    },
    {
      name: '红橙黄 Warm',
      colors: [
        { name: 'Red 10', hex: '#d13438' }, { name: 'Red 20', hex: '#a4262c' },
        { name: 'Dark Red', hex: '#750b1c' }, { name: 'Cranberry', hex: '#c50f1f' },
        { name: 'Orange 10', hex: '#ff8c00' }, { name: 'Orange 20', hex: '#ca5010' },
        { name: 'Orange 30', hex: '#da3b01' }, { name: 'Yellow 10', hex: '#fce100' },
        { name: 'Gold 10', hex: '#c19c00' }
      ]
    },
    {
      name: '绿青蓝 Cool',
      colors: [
        { name: 'Green 10', hex: '#498205' }, { name: 'Green 20', hex: '#107c10' },
        { name: 'Dark Green', hex: '#0b6a0b' }, { name: 'Teal 10', hex: '#008272' },
        { name: 'Dark Teal', hex: '#004b50' }, { name: 'Cyan 10', hex: '#00b7c3' },
        { name: 'Cyan Blue 10', hex: '#0078d4' }, { name: 'Blue 10', hex: '#4f6bed' },
        { name: 'Dark Blue', hex: '#004e8c' }
      ]
    },
    {
      name: '紫品红 Violet',
      colors: [
        { name: 'Magenta 10', hex: '#c239b3' }, { name: 'Magenta 20', hex: '#881798' },
        { name: 'Pink 10', hex: '#e3008c' }, { name: 'Dark Pink', hex: '#9b0062' },
        { name: 'Magenta Pink 10', hex: '#e43ba6' }, { name: 'Violet 10', hex: '#8764b8' },
        { name: 'Dark Violet', hex: '#5c2d91' }, { name: 'Purple 10', hex: '#886ce4' },
        { name: 'Dark Purple', hex: '#401b6c' }
      ]
    }
  ];

  const OPEN_COLOR = [
    { name: 'Gray 灰', hexes: ['#f8f9fa','#f1f3f5','#e9ecef','#dee2e6','#ced4da','#adb5bd','#868e96','#495057','#343a40','#212529'] },
    { name: 'Red 红', hexes: ['#fff5f5','#ffe3e3','#ffc9c9','#ffa8a8','#ff8787','#ff6b6b','#fa5252','#f03e3e','#e03131','#c92a2a'] },
    { name: 'Pink 粉', hexes: ['#fff0f6','#ffdeeb','#fcc2d7','#faa2c1','#f783ac','#f06595','#e64980','#d6336c','#c2255c','#a61e4d'] },
    { name: 'Grape 葡萄紫', hexes: ['#f8f0fc','#f3d9fa','#eebefa','#e599f7','#da77f2','#cc5de8','#be4bdb','#ae3ec9','#9c36b5','#862e9c'] },
    { name: 'Violet 紫罗兰', hexes: ['#f3f0ff','#e5dbff','#d0bfff','#b197fc','#9775fa','#845ef7','#7950f2','#7048e8','#6741d9','#5f3dc4'] },
    { name: 'Indigo 靛蓝', hexes: ['#edf2ff','#dbe4ff','#bac8ff','#91a7ff','#748ffc','#5c7cfa','#4c6ef5','#4263eb','#3b5bdb','#364fc7'] },
    { name: 'Blue 蓝', hexes: ['#e7f5ff','#d0ebff','#a5d8ff','#74c0fc','#4dabf7','#339af0','#228be6','#1c7ed6','#1971c2','#1864ab'] },
    { name: 'Cyan 青', hexes: ['#e3fafc','#c5f6fa','#99e9f2','#66d9e8','#3bc9db','#22b8cf','#15aabf','#1098ad','#0c8599','#0b7285'] },
    { name: 'Teal 蓝绿', hexes: ['#e6fcf5','#c3fae8','#96f2d7','#63e6be','#38d9a9','#20c997','#12b886','#0ca678','#099268','#087f5b'] },
    { name: 'Green 绿', hexes: ['#ebfbee','#d3f9d8','#b2f2bb','#8ce99a','#69db7c','#51cf66','#40c057','#37b24d','#2f9e44','#2b8a3e'] },
    { name: 'Lime 青柠', hexes: ['#f4fce3','#e9fac8','#d8f5a2','#c0eb75','#a9e34b','#94d82d','#82c91e','#74b816','#66a80f','#5c940d'] },
    { name: 'Yellow 黄', hexes: ['#fff9db','#fff3bf','#ffec99','#ffe066','#ffd43b','#fcc419','#fab005','#f59f00','#f08c00','#e67700'] },
    { name: 'Orange 橙', hexes: ['#fff4e6','#ffe8cc','#ffd8a8','#ffc078','#ffa94d','#ff922b','#fd7e14','#f76707','#e8590c','#d9480f'] }
  ].map((g) => ({
    name: g.name,
    colors: g.hexes.map((hex, idx) => ({ name: `${g.name.split(' ')[0]} ${idx}`, hex }))
  }));

  const ANT_DESIGN = [
    { name: 'Dust Red 薄暮', hexes: ['#fff1f0','#ffccc7','#ffa39e','#ff7875','#ff4d4f','#f5222d','#cf1322','#a8071a','#820014','#5c0011'] },
    { name: 'Volcano 火山', hexes: ['#fff2e8','#ffd8bf','#ffbb96','#ff9c6e','#ff7a45','#fa541c','#d4380d','#ad2102','#871400','#610b00'] },
    { name: 'Sunset Orange 日暮', hexes: ['#fff7e6','#ffe7ba','#ffd591','#ffc069','#ffa940','#fa8c16','#d46b08','#ad4e00','#873800','#612500'] },
    { name: 'Calendula Gold 金盏花', hexes: ['#fffbe6','#fff1b8','#ffe58f','#ffd666','#ffc53d','#faad14','#d48806','#ad6800','#874d00','#613400'] },
    { name: 'Sunrise Yellow 日出', hexes: ['#feffe6','#ffffb8','#fffb8f','#fff566','#ffec3d','#fadb14','#d4b106','#ad8b00','#876800','#614700'] },
    { name: 'Lime 青柠', hexes: ['#fcffe6','#f4ffb8','#eaff8f','#d3f261','#bae637','#a0d911','#7cb305','#5b8c00','#3f6600','#254000'] },
    { name: 'Polar Green 极光绿', hexes: ['#f6ffed','#d9f7be','#b7eb8f','#95de64','#73d13d','#52c41a','#389e0d','#237804','#135200','#092b00'] },
    { name: 'Cyan 明青', hexes: ['#e6fffb','#b5f5ec','#87e8de','#5cdbd3','#36cfc9','#13c2c2','#08979c','#006d75','#00474f','#002329'] },
    { name: 'Daybreak Blue 拂晓蓝', hexes: ['#e6f4ff','#bae0ff','#91caff','#69b1ff','#4096ff','#1677ff','#0958d9','#003eb3','#002c8c','#001d66'] },
    { name: 'Geek Blue 极客蓝', hexes: ['#f0f5ff','#d6e4ff','#adc6ff','#85a5ff','#597ef7','#2f54eb','#1d39c4','#10239e','#061178','#030852'] },
    { name: 'Golden Purple 酱紫', hexes: ['#f9f0ff','#efdbff','#d3adf7','#b37feb','#9254de','#722ed1','#531dab','#391085','#22075e','#120338'] },
    { name: 'Magenta 法式洋红', hexes: ['#fff0f6','#ffd6e7','#ffadd2','#ff85c0','#f759ab','#eb2f96','#c41d7f','#9e1068','#780650','#520339'] },
    { name: 'Neutral 中性灰', hexes: ['#ffffff','#fafafa','#f5f5f5','#f0f0f0','#d9d9d9','#bfbfbf','#8c8c8c','#595959','#434343','#262626'] }
  ].map((g) => ({
    name: g.name,
    colors: g.hexes.map((hex, idx) => ({ name: `${g.name.split(' ')[0]}-${idx + 1}`, hex }))
  }));

  const MATERIAL_SHADES = ['50','100','200','300','400','500','600','700','800','900'];
  const MATERIAL_DESIGN = [
    { name: 'Red', hexes: ['#ffebee','#ffcdd2','#ef9a9a','#e57373','#ef5350','#f44336','#e53935','#d32f2f','#c62828','#b71c1c'] },
    { name: 'Pink', hexes: ['#fce4ec','#f8bbd0','#f48fb1','#f06292','#ec407a','#e91e63','#d81b60','#c2185b','#ad1457','#880e4f'] },
    { name: 'Purple', hexes: ['#f3e5f5','#e1bee7','#ce93d8','#ba68c8','#ab47bc','#9c27b0','#8e24aa','#7b1fa2','#6a1b9a','#4a148c'] },
    { name: 'Deep Purple', hexes: ['#ede7f6','#d1c4e9','#b39ddb','#9575cd','#7e57c2','#673ab7','#5e35b1','#512da8','#4527a0','#311b92'] },
    { name: 'Indigo', hexes: ['#e8eaf6','#c5cae9','#9fa8da','#7986cb','#5c6bc0','#3f51b5','#3949ab','#303f9f','#283593','#1a237e'] },
    { name: 'Blue', hexes: ['#e3f2fd','#bbdefb','#90caf9','#64b5f6','#42a5f5','#2196f3','#1e88e5','#1976d2','#1565c0','#0d47a1'] },
    { name: 'Light Blue', hexes: ['#e1f5fe','#b3e5fc','#81d4fa','#4fc3f7','#29b6f6','#03a9f4','#039be5','#0288d1','#0277bd','#01579b'] },
    { name: 'Cyan', hexes: ['#e0f7fa','#b2ebf2','#80deea','#4dd0e1','#26c6da','#00bcd4','#00acc1','#0097a7','#00838f','#006064'] },
    { name: 'Teal', hexes: ['#e0f2f1','#b2dfdb','#80cbc4','#4db6ac','#26a69a','#009688','#00897b','#00796b','#00695c','#004d40'] },
    { name: 'Green', hexes: ['#e8f5e9','#c8e6c9','#a5d6a7','#81c784','#66bb6a','#4caf50','#43a047','#388e3c','#2e7d32','#1b5e20'] },
    { name: 'Light Green', hexes: ['#f1f8e9','#dcedc8','#c5e1a5','#aed581','#9ccc65','#8bc34a','#7cb342','#689f38','#558b2f','#33691e'] },
    { name: 'Lime', hexes: ['#f9fbe7','#f0f4c3','#e6ee9c','#dce775','#d4e157','#cddc39','#c0ca33','#afb42b','#9e9d24','#827717'] },
    { name: 'Yellow', hexes: ['#fffde7','#fff9c4','#fff59d','#fff176','#ffee58','#ffeb3b','#fdd835','#fbc02d','#f9a825','#f57f17'] },
    { name: 'Amber', hexes: ['#fff8e1','#ffecb3','#ffe082','#ffd54f','#ffca28','#ffc107','#ffb300','#ffa000','#ff8f00','#ff6f00'] },
    { name: 'Orange', hexes: ['#fff3e0','#ffe0b2','#ffcc80','#ffb74d','#ffa726','#ff9800','#fb8c00','#f57c00','#ef6c00','#e65100'] },
    { name: 'Deep Orange', hexes: ['#fbe9e7','#ffccbc','#ffab91','#ff8a65','#ff7043','#ff5722','#f4511e','#e64a19','#d84315','#bf360c'] },
    { name: 'Brown', hexes: ['#efebe9','#d7ccc8','#bcaaa4','#a1887f','#8d6e63','#795548','#6d4c41','#5d4037','#4e342e','#3e2723'] },
    { name: 'Grey', hexes: ['#fafafa','#f5f5f5','#eeeeee','#e0e0e0','#bdbdbd','#9e9e9e','#757575','#616161','#424242','#212121'] },
    { name: 'Blue Grey', hexes: ['#eceff1','#cfd8dc','#b0bec5','#90a4ae','#78909c','#607d8b','#546e7a','#455a64','#37474f','#263238'] }
  ].map((g) => ({
    name: g.name,
    colors: g.hexes.map((hex, idx) => ({ name: `${g.name} ${MATERIAL_SHADES[idx]}`, hex }))
  }));

  return {
    flat: FLAT_UI,
    fluent: FLUENT_DESIGN,
    opencolor: OPEN_COLOR,
    antd: ANT_DESIGN,
    material: MATERIAL_DESIGN
  };
});
