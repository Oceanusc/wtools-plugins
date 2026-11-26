(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GradientData = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GRADIENTS = [
    { name: 'Warm Flame', hue: 'red', angle: 45, stops: ['#ff9a9e', '#fad0c4'] },
    { name: 'Night Fade', hue: 'purple', angle: 0, stops: ['#a18cd1', '#fbc2eb'] },
    { name: 'Spring Warmth', hue: 'orange', angle: 0, stops: ['#fad0c4', '#ffd1ff'] },
    { name: 'Juicy Peach', hue: 'orange', angle: 90, stops: ['#ffecd2', '#fcb69f'] },
    { name: 'Young Passion', hue: 'red', angle: 90, stops: ['#ff8177', '#ff867a', '#ff8c7f', '#f99185', '#cf556c', '#b12a5b'] },
    { name: 'Lady Lips', hue: 'pink', angle: 0, stops: ['#ff9a9e', '#fecfef'] },
    { name: 'Sunny Morning', hue: 'yellow', angle: 120, stops: ['#f6d365', '#fda085'] },
    { name: 'Rainy Ashville', hue: 'purple', angle: 0, stops: ['#fbc2eb', '#a6c1ee'] },
    { name: 'Frozen Dreams', hue: 'pink', angle: 0, stops: ['#fdcbf1', '#e6dee9'] },
    { name: 'Winter Neva', hue: 'blue', angle: 120, stops: ['#a1c4fd', '#c2e9fb'] },
    { name: 'Dusty Grass', hue: 'green', angle: 120, stops: ['#d4fc79', '#96e6a1'] },
    { name: 'Tempting Azure', hue: 'teal', angle: 120, stops: ['#84fab0', '#8fd3f4'] },
    { name: 'Heavy Rain', hue: 'gray', angle: 0, stops: ['#cfd9df', '#e2ebf0'] },
    { name: 'Amy Crisp', hue: 'purple', angle: 120, stops: ['#a6c0fe', '#f68084'] },
    { name: 'Mean Fruit', hue: 'orange', angle: 120, stops: ['#fccb90', '#d57eeb'] },
    { name: 'Deep Blue', hue: 'purple', angle: 120, stops: ['#e0c3fc', '#8ec5fc'] },
    { name: 'Ripe Malinka', hue: 'red', angle: 120, stops: ['#f093fb', '#f5576c'] },
    { name: 'Cloudy Knoxville', hue: 'gray', angle: 120, stops: ['#fdfbfb', '#ebedee'] },
    { name: 'Malibu Beach', hue: 'blue', angle: 90, stops: ['#4facfe', '#00f2fe'] },
    { name: 'New Life', hue: 'green', angle: 90, stops: ['#43e97b', '#38f9d7'] },
    { name: 'True Sunset', hue: 'orange', angle: 90, stops: ['#fa709a', '#fee140'] },
    { name: 'Morpheus Den', hue: 'teal', angle: 0, stops: ['#30cfd0', '#330867'] },
    { name: 'Rare Wind', hue: 'teal', angle: 0, stops: ['#a8edea', '#fed6e3'] },
    { name: 'Near Moon', hue: 'purple', angle: 0, stops: ['#5ee7df', '#b490ca'] },
    { name: 'Wild Apple', hue: 'pink', angle: 0, stops: ['#d299c2', '#fef9d7'] },
    { name: 'Saint Petersburg', hue: 'gray', angle: 135, stops: ['#f5f7fa', '#c3cfe2'] },
    { name: 'Plum Plate', hue: 'purple', angle: 135, stops: ['#667eea', '#764ba2'] },
    { name: 'Everlasting Sky', hue: 'gray', angle: 135, stops: ['#fdfcfb', '#e2d1c3'] },
    { name: 'Happy Fisher', hue: 'blue', angle: 120, stops: ['#89f7fe', '#66a6ff'] },
    { name: 'Blessing', hue: 'orange', angle: 0, stops: ['#fddb92', '#d1fdff'] },
    { name: 'Sharpeye Eagle', hue: 'teal', angle: 0, stops: ['#9890e3', '#b1f4cf'] },
    { name: 'Ladoga Bottom', hue: 'gray', angle: 0, stops: ['#ebc0fd', '#d9ded8'] },
    { name: 'Lemon Gate', hue: 'green', angle: 0, stops: ['#96fbc4', '#f9f586'] },
    { name: 'Itmeo Branding', hue: 'teal', angle: 180, stops: ['#2af598', '#009efd'] },
    { name: 'Zeus Miracle', hue: 'purple', angle: 0, stops: ['#cd9cf2', '#f6f3ff'] },
    { name: 'Deep Relief', hue: 'teal', angle: 0, stops: ['#7085b6', '#87a7d9', '#def3f8'] },
    { name: 'Emerald Water', hue: 'teal', angle: 70, stops: ['#42e695', '#3bb2b8'] },
    { name: 'Fabled Sunset', hue: 'red', angle: 90, stops: ['#231557', '#44107a', '#ff1361', '#fff800'] },
    { name: 'Perfect Blue', hue: 'blue', angle: 90, stops: ['#3d4e81', '#5753c9', '#6e7ff3'] },
    { name: 'Midnight City', hue: 'dark', angle: 135, stops: ['#232526', '#414345'] },
    { name: 'Royal', hue: 'dark', angle: 135, stops: ['#141e30', '#243b55'] },
    { name: 'Cosmic Fusion', hue: 'purple', angle: 135, stops: ['#ff00cc', '#333399'] },
    { name: 'Flame Orange', hue: 'orange', angle: 135, stops: ['#f12711', '#f5af19'] },
    { name: 'Fresh Mint', hue: 'green', angle: 135, stops: ['#11998e', '#38ef7d'] },
    { name: 'Ocean View', hue: 'blue', angle: 135, stops: ['#2193b0', '#6dd5ed'] },
    { name: 'Sublime Light', hue: 'pink', angle: 135, stops: ['#fc5c7d', '#6a82fb'] },
    { name: 'Witching Hour', hue: 'dark', angle: 135, stops: ['#c31432', '#240b36'] },
    { name: 'Ultra Violet', hue: 'purple', angle: 135, stops: ['#654ea3', '#eaafc8'] },
    { name: 'Citrus Peel', hue: 'yellow', angle: 135, stops: ['#fdc830', '#f37335'] },
    { name: 'Blue Raspberry', hue: 'blue', angle: 135, stops: ['#00b4db', '#0083b0'] },
    { name: 'Crystalline', hue: 'teal', angle: 135, stops: ['#00cdac', '#8ddad5'] },
    { name: 'Evening Sunshine', hue: 'red', angle: 135, stops: ['#b92b27', '#1565c0'] },
    { name: 'Dark Knight', hue: 'dark', angle: 135, stops: ['#0f2027', '#203a43', '#2c5364'] },
    { name: 'Summer Breeze', hue: 'green', angle: 135, stops: ['#56ab2f', '#a8e063'] },
    { name: 'Crimson Tide', hue: 'red', angle: 135, stops: ['#ed213a', '#93291e'] },
    { name: 'Velvet Sun', hue: 'yellow', angle: 135, stops: ['#e1eec3', '#f05053'] }
  ];

  const HUE_FILTERS = [
    { id: 'all', label: '全部', color: 'conic-gradient(#ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #af52de, #ff3b30)' },
    { id: 'red', label: '红', color: '#e74c3c' },
    { id: 'orange', label: '橙', color: '#f39c12' },
    { id: 'yellow', label: '黄', color: '#f1c40f' },
    { id: 'green', label: '绿', color: '#2ecc71' },
    { id: 'teal', label: '青', color: '#1abc9c' },
    { id: 'blue', label: '蓝', color: '#3498db' },
    { id: 'purple', label: '紫', color: '#9b59b6' },
    { id: 'pink', label: '粉', color: '#fd79a8' },
    { id: 'gray', label: '灰', color: '#bdc3c7' },
    { id: 'dark', label: '暗', color: '#2c3e50' }
  ];

  return { GRADIENTS, HUE_FILTERS };
});
