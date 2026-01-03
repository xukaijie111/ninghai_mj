/**
 * 麻将牌模型
 * 宁海麻将包含：万子、筒子、索子、字牌、花牌
 */

// 牌的类型
const CARD_TYPES = {
  WAN: 'wan',      // 万子
  TONG: 'tong',    // 筒子
  SUO: 'suo',      // 索子
  ZI: 'zi',        // 字牌（东南西北中发白）
  HUA: 'hua'       // 花牌（梅兰菊竹春夏秋冬）
};

// 字牌定义
const ZI_CARDS = {
  DONG: 1,    // 东
  NAN: 2,     // 南
  XI: 3,      // 西
  BEI: 4,     // 北
  ZHONG: 5,   // 中
  FA: 6,      // 发
  BAI: 7      // 白
};

// 花牌定义
const HUA_CARDS = {
  MEI: 1,     // 梅
  LAN: 2,     // 兰
  JU: 3,      // 菊
  ZHU: 4,     // 竹
  CHUN: 5,    // 春
  XIA: 6,     // 夏
  QIU: 7,     // 秋
  DONG: 8     // 冬
};

// 花牌对应的风位
const HUA_FENG_MAP = {
  [HUA_CARDS.MEI]: 'dong',   // 梅对应东风
  [HUA_CARDS.CHUN]: 'dong',  // 春对应东风
  [HUA_CARDS.LAN]: 'nan',    // 兰对应南风
  [HUA_CARDS.XIA]: 'nan',    // 夏对应南风
  [HUA_CARDS.JU]: 'xi',      // 菊对应西风
  [HUA_CARDS.QIU]: 'xi',     // 秋对应西风
  [HUA_CARDS.ZHU]: 'bei',    // 竹对应北风
  [HUA_CARDS.DONG]: 'bei'    // 冬对应北风
};

class Card {
  constructor(type, value) {
    this.type = type;
    this.value = value;
    this.id = this.generateId();
  }

  /**
   * 生成牌的唯一标识
   */
  generateId() {
    return `${this.type}_${this.value}`;
  }

  /**
   * 判断是否为花牌
   */
  isFlower() {
    return this.type === CARD_TYPES.HUA;
  }

  /**
   * 判断是否为字牌
   */
  isHonor() {
    return this.type === CARD_TYPES.ZI;
  }

  /**
   * 判断是否为数字牌（万筒索）
   */
  isNumber() {
    return [CARD_TYPES.WAN, CARD_TYPES.TONG, CARD_TYPES.SUO].includes(this.type);
  }

  /**
   * 判断是否为幺九牌
   */
  isTerminal() {
    if (!this.isNumber()) return false;
    return this.value === 1 || this.value === 9;
  }

  /**
   * 判断是否为幺九字牌
   */
  isTerminalOrHonor() {
    return this.isTerminal() || this.isHonor();
  }

  /**
   * 获取花牌对应的风位
   */
  getFlowerFeng() {
    if (!this.isFlower()) return null;
    return HUA_FENG_MAP[this.value] || null;
  }

  /**
   * 判断两张牌是否相同
   */
  equals(other) {
    return this.type === other.type && this.value === other.value;
  }

  /**
   * 判断是否可以组成顺子（仅数字牌）
   */
  canFormSequence(card2, card3) {
    if (!this.isNumber() || !card2.isNumber() || !card3.isNumber()) {
      return false;
    }
    
    if (this.type !== card2.type || this.type !== card3.type) {
      return false;
    }

    const values = [this.value, card2.value, card3.value].sort((a, b) => a - b);
    return values[1] === values[0] + 1 && values[2] === values[1] + 1;
  }

  /**
   * 获取牌的显示名称
   */
  getDisplayName() {
    const typeNames = {
      [CARD_TYPES.WAN]: '万',
      [CARD_TYPES.TONG]: '筒',
      [CARD_TYPES.SUO]: '索',
      [CARD_TYPES.ZI]: '',
      [CARD_TYPES.HUA]: ''
    };

    if (this.type === CARD_TYPES.ZI) {
      const ziNames = ['', '东', '南', '西', '北', '中', '发', '白'];
      return ziNames[this.value] || '';
    }

    if (this.type === CARD_TYPES.HUA) {
      const huaNames = ['', '梅', '兰', '菊', '竹', '春', '夏', '秋', '冬'];
      return huaNames[this.value] || '';
    }

    return `${this.value}${typeNames[this.type]}`;
  }

  /**
   * 转换为JSON对象
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      value: this.value,
      displayName: this.getDisplayName()
    };
  }

  /**
   * 从JSON对象创建Card实例
   */
  static fromJSON(json) {
    return new Card(json.type, json.value);
  }
}

/**
 * 麻将牌堆类
 */
class CardDeck {
  constructor() {
    this.cards = [];
    this.initializeDeck();
  }

  /**
   * 初始化牌堆（宁海麻将144张牌）
   */
  initializeDeck() {
    this.cards = [];

    // 万子、筒子、索子各36张（1-9各4张）
    [CARD_TYPES.WAN, CARD_TYPES.TONG, CARD_TYPES.SUO].forEach(type => {
      for (let value = 1; value <= 9; value++) {
        for (let i = 0; i < 4; i++) {
          this.cards.push(new Card(type, value));
        }
      }
    });

    // 字牌28张（东南西北中发白各4张）
    for (let value = 1; value <= 7; value++) {
      for (let i = 0; i < 4; i++) {
        this.cards.push(new Card(CARD_TYPES.ZI, value));
      }
    }

    // 花牌8张（梅兰菊竹春夏秋冬各1张）
    for (let value = 1; value <= 8; value++) {
      this.cards.push(new Card(CARD_TYPES.HUA, value));
    }
  }

  /**
   * 洗牌
   */
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /**
   * 摸牌
   */
  drawCard() {
    return this.cards.pop();
  }

  /**
   * 摸多张牌
   */
  drawCards(count) {
    const drawnCards = [];
    for (let i = 0; i < count && this.cards.length > 0; i++) {
      drawnCards.push(this.drawCard());
    }
    return drawnCards;
  }

  /**
   * 获取剩余牌数
   */
  getRemainingCount() {
    return this.cards.length;
  }

  /**
   * 检查是否还有牌
   */
  hasCards() {
    return this.cards.length > 0;
  }
}

module.exports = {
  Card,
  CardDeck,
  CARD_TYPES,
  ZI_CARDS,
  HUA_CARDS,
  HUA_FENG_MAP
};
