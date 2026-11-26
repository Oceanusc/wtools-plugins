// Color names and HEX values adapted from chinacolor (MIT), revision c64b9ed6c38375c75943baf414784b6b1b98bb50.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TraditionalCN = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SOLAR_TERMS = [
    {
      term: '立春', season: '春', desc: '东风解冻，蛰虫始振',
      colors: [
        { name: "黄白游", hex: '#fff799' }, { name: "松花", hex: '#ffee6f' }, { name: "缃叶", hex: '#ecd452' }, { name: "苍黄", hex: '#b6a014' },
        { name: "天缥", hex: '#d5ebe1' }, { name: "沧浪", hex: '#b1d5c8' }, { name: "苍筤", hex: '#99bcac' }, { name: "缥碧", hex: '#80a492' },
        { name: "流黄", hex: '#8b7042' }, { name: "栗壳", hex: '#775039' }, { name: "龙战", hex: '#5f4321' }, { name: "青骊", hex: '#422517' },
        { name: "海天霞", hex: '#f3a694' }, { name: "缙云", hex: '#ee7959' }, { name: "纁黄", hex: '#ba5140' }, { name: "珊瑚赫", hex: '#c12c1f' }
      ]
    },
    {
      term: '雨水', season: '春', desc: '獭祭鱼，鸿雁来，草木萌动',
      colors: [
        { name: "盈盈", hex: '#f9d3e3' }, { name: "水红", hex: '#ecb0c1' }, { name: "苏梅", hex: '#dd7694' }, { name: "紫茎屏风", hex: '#a76283' },
        { name: "葭灰", hex: '#beb1aa' }, { name: "黄埃", hex: '#b49273' }, { name: "老僧衣", hex: '#a46244' }, { name: "玄天", hex: '#6b5458' },
        { name: "黄河琉璃", hex: '#e5a84b' }, { name: "库金", hex: '#e18a3b' }, { name: "缊韨", hex: '#984f31' }, { name: "紫瓯", hex: '#7c461e' },
        { name: "欧碧", hex: '#c0d695' }, { name: "春辰", hex: '#a9be7b' }, { name: "碧山", hex: '#779649' }, { name: "青青", hex: '#4f6f46' }
      ]
    },
    {
      term: '惊蛰', season: '春', desc: '桃始华，仓庚鸣，鹰化为鸠',
      colors: [
        { name: "赤缇", hex: '#ba5b49' }, { name: "朱草", hex: '#a64036' }, { name: "綪茷", hex: '#9e2a22' }, { name: "顺圣", hex: '#7c191e' },
        { name: "桃夭", hex: '#f6bec8' }, { name: "杨妃", hex: '#f091a0' }, { name: "长春", hex: '#dc6b82' }, { name: "牙绯", hex: '#c35c5d' },
        { name: "黄栗留", hex: '#fedc5e' }, { name: "栀子", hex: '#fac03d' }, { name: "黄不老", hex: '#db9b34' }, { name: "柘黄", hex: '#c67915' },
        { name: "青鸾", hex: '#9aa7b1' }, { name: "菘蓝", hex: '#6b798e' }, { name: "青黛", hex: '#45465e' }, { name: "绀蝶", hex: '#2c2f3b' }
      ]
    },
    {
      term: '春分', season: '春', desc: '玄鸟至，雷乃发声，始电',
      colors: [
        { name: "皦玉", hex: '#ebeee8' }, { name: "吉量", hex: '#ebeddf' }, { name: "韶粉", hex: '#e0e0d0' }, { name: "霜地", hex: '#c7c6b6' },
        { name: "夏籥", hex: '#d2af9d' }, { name: "紫磨金", hex: '#bc836b' }, { name: "檀色", hex: '#b26d5d' }, { name: "赭罗", hex: '#9a6655' },
        { name: "黄丹", hex: '#ea5514' }, { name: "洛神珠", hex: '#d23918' }, { name: "丹雘", hex: '#c8161d' }, { name: "水华朱", hex: '#a72126' },
        { name: "青冥", hex: '#3271ae' }, { name: "青雘", hex: '#007175' }, { name: "青緺", hex: '#284852' }, { name: "骐驎", hex: '#12264f' }
      ]
    },
    {
      term: '清明', season: '春', desc: '桐始华，田鼠化为鴽，虹始见',
      colors: [
        { name: "紫蒲", hex: '#a6559d' }, { name: "赪紫", hex: '#8a1874' }, { name: "齐紫", hex: '#6c216d' }, { name: "凝夜紫", hex: '#422256' },
        { name: "冻缥", hex: '#bec2b3' }, { name: "春碧", hex: '#9d9d82' }, { name: "执大象", hex: '#919177' }, { name: "苔古", hex: '#79836c' },
        { name: "香炉紫烟", hex: '#d3ccd6' }, { name: "紫菂", hex: '#9b8ea9' }, { name: "拂紫绵", hex: '#7e527f' }, { name: "三公子", hex: '#663d74' },
        { name: "琅玕紫", hex: '#cb5c83' }, { name: "红踯躅", hex: '#b83570' }, { name: "魏红", hex: '#a73766' }, { name: "魏紫", hex: '#903754' }
      ]
    },
    {
      term: '谷雨', season: '春', desc: '萍始生，鸣鸠拂其羽，戴胜降于桑',
      colors: [
        { name: "昌荣", hex: '#dcc7e1' }, { name: "紫薄汗", hex: '#bba1cb' }, { name: "茈藐", hex: '#a67eb7' }, { name: "紫紶", hex: '#7d5284' },
        { name: "苍葭", hex: '#a8bf8f' }, { name: "庭芜绿", hex: '#68945c' }, { name: "翠微", hex: '#4c8045' }, { name: "翠虬", hex: '#446a37' },
        { name: "碧落", hex: '#aed0ee' }, { name: "挼蓝", hex: '#6e9bc5' }, { name: "青雀头黛", hex: '#354e6b' }, { name: "螺子黛", hex: '#13393e' },
        { name: "露褐", hex: '#bd8253' }, { name: "檀褐", hex: '#945635' }, { name: "緅絺", hex: '#804c2e' }, { name: "目童子", hex: '#5b3222' }
      ]
    },
    {
      term: '立夏', season: '夏', desc: '蝼蝈鸣，蚯蚓出，王瓜生',
      colors: [
        { name: "青粲", hex: '#c3d94e' }, { name: "翠缥", hex: '#b7d332' }, { name: "人籁", hex: '#9ebc19' }, { name: "水龙吟", hex: '#84a729' },
        { name: "地籁", hex: '#dfceb4' }, { name: "大块", hex: '#bfa782' }, { name: "养生主", hex: '#b49b7f' }, { name: "大云", hex: '#94784f' },
        { name: "溶溶月", hex: '#bec2bc' }, { name: "绍衣", hex: '#a8a19c' }, { name: "石莲褐", hex: '#92897b' }, { name: "黑朱", hex: '#70695d' },
        { name: "朱颜酡", hex: '#f29a76' }, { name: "苕荣", hex: '#ed6d3d' }, { name: "檎丹", hex: '#e94829' }, { name: "丹罽", hex: '#e60012' }
      ]
    },
    {
      term: '小满', season: '夏', desc: '苦菜秀，靡草死，麦秋至',
      colors: [
        { name: "彤管", hex: '#e2a2ac' }, { name: "渥赭", hex: '#dd6b7b' }, { name: "唇脂", hex: '#c25160' }, { name: "朱孔阳", hex: '#b81a35' },
        { name: "石发", hex: '#6a8d52' }, { name: "漆姑", hex: '#5d8351' }, { name: "芰荷", hex: '#4f794a' }, { name: "官绿", hex: '#2a6e3f' },
        { name: "仙米", hex: '#d4c9aa' }, { name: "黄螺", hex: '#b4a379' }, { name: "降真香", hex: '#9e8358' }, { name: "远志", hex: '#81663b' },
        { name: "嫩鹅黄", hex: '#f2c867' }, { name: "鞠衣", hex: '#d3a237' }, { name: "郁金裙", hex: '#d08635' }, { name: "黄流", hex: '#9f6027' }
      ]
    },
    {
      term: '芒种', season: '夏', desc: '螳螂生，鵙始鸣，反舌无声',
      colors: [
        { name: "筠雾", hex: '#d5d1ae' }, { name: "瓷秘", hex: '#bfc096' }, { name: "琬琰", hex: '#a9a886' }, { name: "青圭", hex: '#92905d' },
        { name: "鸣珂", hex: '#b3b59c' }, { name: "青玉案", hex: '#a8b092' }, { name: "出岫", hex: '#a9a773' }, { name: "风入松", hex: '#868c4e' },
        { name: "如梦令", hex: '#ddbb99' }, { name: "芸黄", hex: '#d2a36c' }, { name: "金埒", hex: '#be9457' }, { name: "雌黄", hex: '#b4884d' },
        { name: "曾青", hex: '#535164' }, { name: "䒌靘", hex: '#454659' }, { name: "璆琳", hex: '#343041' }, { name: "瑾瑜", hex: '#1e2732' }
      ]
    },
    {
      term: '夏至', season: '夏', desc: '鹿角解，蜩始鸣，半夏生',
      colors: [
        { name: "赩炽", hex: '#cb523e' }, { name: "石榴裙", hex: '#b13b2e' }, { name: "朱湛", hex: '#95302e' }, { name: "大繎", hex: '#822327' },
        { name: "月魄", hex: '#b2b6b6' }, { name: "不皂", hex: '#a7aaa1' }, { name: "雷雨垂", hex: '#7a7b78' }, { name: "石涅", hex: '#686a67' },
        { name: "扶光", hex: '#f0c2a2' }, { name: "椒房", hex: '#db9c5e' }, { name: "红友", hex: '#d9883d' }, { name: "光明砂", hex: '#cc5d20' },
        { name: "山矾", hex: '#f5f3f2' }, { name: "玉頩", hex: '#eae5e3' }, { name: "二目鱼", hex: '#dfe0d9' }, { name: "明月珰", hex: '#d4d3ca' }
      ]
    },
    {
      term: '小暑', season: '夏', desc: '温风至，蟋蟀居壁，鹰始挚',
      colors: [
        { name: "骍刚", hex: '#f5b087' }, { name: "赪霞", hex: '#f18f60' }, { name: "赪尾", hex: '#ef845d' }, { name: "朱柿", hex: '#ed6d46' },
        { name: "天球", hex: '#e0dfc6' }, { name: "行香子", hex: '#bfb99c' }, { name: "王刍", hex: '#a99f70' }, { name: "荩箧", hex: '#877d52' },
        { name: "赤灵", hex: '#954024' }, { name: "丹秫", hex: '#873424' }, { name: "木兰", hex: '#662b1f' }, { name: "麒麟竭", hex: '#4c1e1a' },
        { name: "柔蓝", hex: '#106898' }, { name: "碧城", hex: '#12507b' }, { name: "蓝采和", hex: '#06436f' }, { name: "帝释青", hex: '#003460' }
      ]
    },
    {
      term: '大暑', season: '夏', desc: '腐草为萤，土润溽暑，大雨时行',
      colors: [
        { name: "夕岚", hex: '#e3adb9' }, { name: "雌霓", hex: '#cf929e' }, { name: "绛纱", hex: '#b27777' }, { name: "茹藘", hex: '#a35f65' },
        { name: "葱青", hex: '#edf1bb' }, { name: "少艾", hex: '#e3eb98' }, { name: "绮钱", hex: '#d8de8a' }, { name: "翠樽", hex: '#cdd171' },
        { name: "石蜜", hex: '#d4bf89' }, { name: "沙饧", hex: '#bfa670' }, { name: "巨吕", hex: '#aa8e59' }, { name: "吉金", hex: '#896d47' },
        { name: "山岚", hex: '#bed2bb' }, { name: "渌波", hex: '#9bb496' }, { name: "青楸", hex: '#81a380' }, { name: "菉竹", hex: '#698e6a' }
      ]
    },
    {
      term: '立秋', season: '秋', desc: '凉风至，白露降，寒蝉鸣',
      colors: [
        { name: "窃蓝", hex: '#88abda' }, { name: "监德", hex: '#6f94cd' }, { name: "苍苍", hex: '#5976ba' }, { name: "群青", hex: '#2e59a7' },
        { name: "白青", hex: '#98b6c2' }, { name: "竹月", hex: '#7f9faf' }, { name: "空青", hex: '#66889e' }, { name: "太师青", hex: '#547689' },
        { name: "缟羽", hex: '#efefef' }, { name: "香皮", hex: '#d8d1c5' }, { name: "云母", hex: '#c6beb1' }, { name: "佩玖", hex: '#ac9f8a' },
        { name: "麹尘", hex: '#c0d09d' }, { name: "绿沈", hex: '#938f4c' }, { name: "绞衣", hex: '#7f754c' }, { name: "素綦", hex: '#595333' }
      ]
    },
    {
      term: '处暑', season: '秋', desc: '鹰乃祭鸟，天地始肃，禾乃登',
      colors: [
        { name: "退红", hex: '#f0cfe3' }, { name: "樱花", hex: '#e4b8d5' }, { name: "丁香", hex: '#ce93bf' }, { name: "木槿", hex: '#ba79b1' },
        { name: "余白", hex: '#c9cfc1' }, { name: "兰苕", hex: '#a8b78c' }, { name: "碧滋", hex: '#90a07d' }, { name: "葱倩", hex: '#6c8650' },
        { name: "云门", hex: '#a2d2e2' }, { name: "西子", hex: '#87c0ca' }, { name: "天水碧", hex: '#5aa4ae' }, { name: "法翠", hex: '#108b96' },
        { name: "桑蕾", hex: '#ead89a' }, { name: "太一余粮", hex: '#d5b45c' }, { name: "秋香", hex: '#bf9c46' }, { name: "老茯神", hex: '#aa8534' }
      ]
    },
    {
      term: '白露', season: '秋', desc: '鸿雁来，玄鸟归，群鸟养羞',
      colors: [
        { name: "凝脂", hex: '#f5f2e9' }, { name: "玉色", hex: '#eae4d1' }, { name: "黄润", hex: '#dfd6b8' }, { name: "缣缃", hex: '#d5c8a0' },
        { name: "蕉月", hex: '#86908a' }, { name: "千山翠", hex: '#6b7d73' }, { name: "结绿", hex: '#555f4d' }, { name: "绿云", hex: '#45493d' },
        { name: "藕丝秋半", hex: '#d3cbc5' }, { name: "苍烟落照", hex: '#c8b5b3' }, { name: "红藤杖", hex: '#928187' }, { name: "紫鼠", hex: '#594c57' },
        { name: "黄粱", hex: '#c4b798' }, { name: "蒸栗", hex: '#a58a5f' }, { name: "射干", hex: '#7c623f' }, { name: "油葫芦", hex: '#644d31' }
      ]
    },
    {
      term: '秋分', season: '秋', desc: '雷始收声，蛰虫坯户，水始涸',
      colors: [
        { name: "卵色", hex: '#d5e3d4' }, { name: "葭菼", hex: '#cad7c5' }, { name: "冰台", hex: '#becab7' }, { name: "青古", hex: '#b3bda9' },
        { name: "栾华", hex: '#c0ad5e' }, { name: "大赤", hex: '#aa9649' }, { name: "佛赤", hex: '#8f3d2c' }, { name: "蜜褐", hex: '#683632' },
        { name: "孔雀蓝", hex: '#4994c4' }, { name: "吐绶蓝", hex: '#4182a4' }, { name: "鱼师青", hex: '#32788a' }, { name: "软翠", hex: '#006d87' },
        { name: "浅云", hex: '#eaeef1' }, { name: "素采", hex: '#d4dde1' }, { name: "影青", hex: '#bdcbd2' }, { name: "逍遥游", hex: '#b2bfc3' }
      ]
    },
    {
      term: '寒露', season: '秋', desc: '鸿雁来宾，雀入大水为蛤，菊有黄华',
      colors: [
        { name: "醽醁", hex: '#a6bab1' }, { name: "翠涛", hex: '#819d8e' }, { name: "青梅", hex: '#778a77' }, { name: "翕赩", hex: '#5f766a' },
        { name: "九斤黄", hex: '#ddb078' }, { name: "杏子", hex: '#da9233' }, { name: "媚蝶", hex: '#bc6e37' }, { name: "韎韐", hex: '#9f5221' },
        { name: "东方既白", hex: '#8ba3c7' }, { name: "绀宇", hex: '#003d74' }, { name: "佛头青", hex: '#19325f' }, { name: "花青", hex: '#1a2847' },
        { name: "弗肯红", hex: '#ecd9c7' }, { name: "赤璋", hex: '#e1c199' }, { name: "茧色", hex: '#c6a268' }, { name: "密陀僧", hex: '#b3934b' }
      ]
    },
    {
      term: '霜降', season: '秋', desc: '豺乃祭兽，草木黄落，蛰虫咸俯',
      colors: [
        { name: "银朱", hex: '#d12920' }, { name: "胭脂虫", hex: '#ab1d22' }, { name: "朱樱", hex: '#8f1d22' }, { name: "爵头", hex: '#631216' },
        { name: "甘石", hex: '#bdb2b2' }, { name: "迷楼灰", hex: '#91828f' }, { name: "鸦雏", hex: '#6a5b6d' }, { name: "烟墨", hex: '#5c4f55' },
        { name: "十样锦", hex: '#f8c6b5' }, { name: "檀唇", hex: '#da9e8c' }, { name: "琼琚", hex: '#d77f66' }, { name: "棠梨", hex: '#b15a43' },
        { name: "蜜合", hex: '#dfd7c2' }, { name: "假山南", hex: '#d4c1a6' }, { name: "紫花布", hex: '#bea78b' }, { name: "沉香", hex: '#99806c' }
      ]
    },
    {
      term: '立冬', season: '冬', desc: '水始冰，地始冻，雉入大水为蜃',
      colors: [
        { name: "半见", hex: '#fffbc7' }, { name: "女贞黄", hex: '#f7eead' }, { name: "绢纨", hex: '#ece093' }, { name: "姜黄", hex: '#d6c560' },
        { name: "繱犗", hex: '#88bfb8' }, { name: "二绿", hex: '#5da39d' }, { name: "铜青", hex: '#3d8e86' }, { name: "石绿", hex: '#206864' },
        { name: "黄琮", hex: '#9e8c6b' }, { name: "茶色", hex: '#887657' }, { name: "伽罗", hex: '#6d5c3d' }, { name: "苍艾", hex: '#5a4b3b' },
        { name: "藕丝褐", hex: '#a88787' }, { name: "葡萄褐", hex: '#9e696d' }, { name: "苏方", hex: '#81474c' }, { name: "福色", hex: '#662b2f' }
      ]
    },
    {
      term: '小雪', season: '冬', desc: '虹藏不见，天气上升，闭塞而成冬',
      colors: [
        { name: "龙膏烛", hex: '#de82a7' }, { name: "黪紫", hex: '#cc73a0' }, { name: "胭脂水", hex: '#b95a89' }, { name: "胭脂紫", hex: '#b0436f' },
        { name: "小红", hex: '#e67762' }, { name: "岱赭", hex: '#dd6b4f' }, { name: "鹤顶红", hex: '#d24735' }, { name: "朱殷", hex: '#b93a26' },
        { name: "月白", hex: '#d4e5ef' }, { name: "星郎", hex: '#bcd4e7' }, { name: "晴山", hex: '#a3bbdb' }, { name: "品月", hex: '#8aabcc' },
        { name: "明茶褐", hex: '#9e8368' }, { name: "荆褐", hex: '#906c4a' }, { name: "驼褐", hex: '#7c5b3e' }, { name: "椒褐", hex: '#72453a' }
      ]
    },
    {
      term: '大雪', season: '冬', desc: '鹖鴠不鸣，虎始交，荔挺出',
      colors: [
        { name: "粉米", hex: '#efc4ce' }, { name: "縓缘", hex: '#ce8892' }, { name: "美人祭", hex: '#c35c6a' }, { name: "鞓红", hex: '#b04552' },
        { name: "米汤娇", hex: '#eeead9' }, { name: "草白", hex: '#bfc1a9' }, { name: "玄校", hex: '#a9a082' }, { name: "綟绶", hex: '#756c4b' },
        { name: "雀梅", hex: '#788a6f' }, { name: "油绿", hex: '#5d7259' }, { name: "莓莓", hex: '#4e6548' }, { name: "螺青", hex: '#3f503b' },
        { name: "暮山紫", hex: '#a4abd6' }, { name: "紫苑", hex: '#757cbb' }, { name: "优昙瑞", hex: '#615ea8' }, { name: "延维", hex: '#4a4b9d' }
      ]
    },
    {
      term: '冬至', season: '冬', desc: '蚯蚓结，麋角解，水泉动',
      colors: [
        { name: "银红", hex: '#e7cad3' }, { name: "莲红", hex: '#d9a0b3' }, { name: "紫梅", hex: '#bb7a8c' }, { name: "紫矿", hex: '#9e4e56' },
        { name: "咸池", hex: '#daa9a9' }, { name: "红䵂", hex: '#cd7372' }, { name: "蚩尤旗", hex: '#a85858' }, { name: "霁红", hex: '#7c4449' },
        { name: "莺儿", hex: '#ebe1a9' }, { name: "禹余粮", hex: '#e1d279' }, { name: "姚黄", hex: '#d6bc46' }, { name: "蛾黄", hex: '#be8a2f' },
        { name: "濯绛", hex: '#796860' }, { name: "墨黪", hex: '#585248' }, { name: "驖骊", hex: '#46433b' }, { name: "京元", hex: '#31322c' }
      ]
    },
    {
      term: '小寒', season: '冬', desc: '雁北乡，鹊始巢，雉始雊',
      colors: [
        { name: "酂白", hex: '#f6f9e4' }, { name: "断肠", hex: '#ecebc2' }, { name: "田赤", hex: '#e1d384' }, { name: "黄封", hex: '#cab272' },
        { name: "丁香褐", hex: '#bd9683' }, { name: "棠梨褐", hex: '#955a42' }, { name: "朱石栗", hex: '#81492c' }, { name: "枣褐", hex: '#68361a' },
        { name: "秋蓝", hex: '#7d929f' }, { name: "育阳染", hex: '#576470' }, { name: "霁蓝", hex: '#3c4654' }, { name: "獭见", hex: '#151d29' },
        { name: "井天", hex: '#a4c9cc' }, { name: "正青", hex: '#6ca8af' }, { name: "扁青", hex: '#509296' }, { name: "䌦色", hex: '#226b68' }
      ]
    },
    {
      term: '大寒', season: '冬', desc: '鸡始乳，征鸟厉疾，水泽腹坚',
      colors: [
        { name: "紫府", hex: '#995d7f' }, { name: "地血", hex: '#814662' }, { name: "芥拾紫", hex: '#602641' }, { name: "油紫", hex: '#420b2f' },
        { name: "骨缥", hex: '#ebe3c7' }, { name: "青白玉", hex: '#cac5a0' }, { name: "绿豆褐", hex: '#92896b' }, { name: "冥色", hex: '#665f4d' },
        { name: "肉红", hex: '#ddc5b8' }, { name: "珠子褐", hex: '#bea89d' }, { name: "鹰背褐", hex: '#8f6d5f' }, { name: "麝香褐", hex: '#694b3c' },
        { name: "石英", hex: '#c8b6bb' }, { name: "银褐", hex: '#9c8d9b' }, { name: "烟红", hex: '#9d858f' }, { name: "紫诰", hex: '#76555d' }
      ]
    }
  ];

  return { SOLAR_TERMS };
});
