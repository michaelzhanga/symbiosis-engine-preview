(function (root) {
  'use strict';

  const HOUR = 60 * 60 * 1000;
  const START = Date.parse('2026-11-10T09:00:00+08:00');
  const PACK = Object.freeze({ price: 36000, lessons: 12, incentive: 3 });
  const LESSON_SAMPLE = Object.freeze({
    speakingShare: 62,
    correctionQuality: 4,
    correction: 'I go to the park yesterday. → I went to the park yesterday.',
    practice: '下次用三个完整句子复述昨天的活动。'
  });
  const ASSESSMENT_SAMPLE = Object.freeze({
    level: 'A1',
    teacher: 'Taylor（演示老师）',
    advice: '先练习用完整句子介绍日常活动，再尝试按时间顺序复述。'
  });
  const PARTNERS = Object.freeze([
    Object.freeze({ id: 'B-01', name: '青禾学习站', city: '云溪市', certified: true, tier: 60 }),
    Object.freeze({ id: 'B-02', name: '知桥学习站', city: '云溪市', certified: false, tier: 55 }),
    Object.freeze({ id: 'B-03', name: '南岸学习站', city: '星湾市', certified: true, tier: 50 })
  ]);
  const LEAD = Object.freeze({
    id: 'L-001',
    studentId: 'C-001',
    city: '云溪市',
    source: '本地公开课',
    transcript: '想先体验一下口语课，周六下午有空，方便约个试听吗？'
  });
  const CASES = Object.freeze({
    standard: { label: '完整链路', seed: [], role: 'S' },
    overdue: { label: '48h 跟进超时', seed: ['score', 'assign', 'fastForward'], role: 'B' },
    refund: { label: '课后退款', seed: [
      'score', 'assign', 'follow', 'assess', 'trial', 'buy', 'submitLesson', 'approveLesson'
    ], role: 'C' }
  });

  function emit(state, role, type, label, details = {}) {
    const event = {
      id: 'EV-' + String(state.events.length + 1).padStart(3, '0'),
      role,
      type,
      label,
      at: new Date(state.clock).toISOString(),
      ids: {
        leadId: state.lead.id,
        studentId: state.lead.studentId,
        ...(state.partner && { partnerId: state.partner.id }),
        ...(state.order && { orderId: state.order.id })
      },
      details
    };
    return { ...state, events: [...state.events, event] };
  }

  function scoreLead(transcript) {
    const rules = [
      { pattern: /体验|试听/, label: '表达体验意愿', points: 45 },
      { pattern: /周[一二三四五六日天]|上午|下午/, label: '给出可约时段', points: 35 },
      { pattern: /约|报名/, label: '主动询问预约', points: 20 }
    ];
    const hits = rules.filter(({ pattern }) => pattern.test(transcript));
    const score = hits.reduce((sum, hit) => sum + hit.points, 0);
    return {
      score,
      level: score >= 70 ? '高意向' : score >= 40 ? '中意向' : '待培育',
      hits: hits.map(({ label, points }) => ({ label, points }))
    };
  }

  function routeLead(lead, partners = PARTNERS) {
    return partners.find((partner) => partner.city === lead.city && partner.certified);
  }

  function slaStatus(state) {
    if (!state.partner) return { label: '待派单', kind: 'neutral' };
    const deadline = state.assignedAt + 48 * HOUR;
    if (state.followedAt !== null) {
      return state.followedAt <= deadline
        ? { label: '按时跟进', kind: 'good', deadline }
        : { label: '超时后补跟', kind: 'warn', deadline };
    }
    return state.clock > deadline
      ? { label: '已超时', kind: 'warn', deadline }
      : { label: '待跟进', kind: 'neutral', deadline };
  }

  function balances(order) {
    if (!order) return { frozen: 0, released: 0, refunded: 0 };
    const released = Math.floor(order.price * order.approved / order.lessons);
    return { released, refunded: order.refunded, frozen: order.price - released - order.refunded };
  }

  function settlement(price, tier) {
    const supply = Math.round(price * tier / 100);
    const reserve = Math.round(price * PACK.incentive / 100);
    return { margin: price - supply, reserve, headquarters: supply - reserve };
  }

  const ACTIONS = {
    score: {
      role: 'S', label: '识别线索意向',
      allowed: (s) => !s.intent,
      run(s) {
        const intent = scoreLead(s.lead.transcript);
        return emit({ ...s, intent }, 'S', 'lead.scored', '线索意向已识别', intent);
      }
    },
    assign: {
      role: 'S', label: '按城市自动派单',
      allowed: (s) => s.intent?.score >= 70 && !s.partner && Boolean(routeLead(s.lead)),
      run(s) {
        const partner = routeLead(s.lead);
        return emit({ ...s, partner, assignedAt: s.clock }, 'S', 'lead.assigned', '线索已派给城市合伙人', {
          city: partner.city, certified: partner.certified, tier: partner.tier
        });
      }
    },
    fastForward: {
      role: 'B', label: '推进演示时间 49h',
      allowed: (s) => Boolean(s.partner) && s.followedAt === null && slaStatus(s).kind !== 'warn',
      run(s) {
        return emit({ ...s, clock: s.clock + 49 * HOUR }, 'B', 'followup.overdue', '线索超过 48h 未跟进', {
          slaHours: 48
        });
      }
    },
    follow: {
      role: 'B', label: '记录跟进并预约体验',
      allowed: (s) => Boolean(s.partner) && s.followedAt === null,
      run(s) {
        const next = { ...s, followedAt: s.clock };
        return emit(next, 'B', 'trial.booked', '已跟进并预约体验课', { sla: slaStatus(next).label });
      }
    },
    assess: {
      role: 'C', label: '查看模拟测评结果',
      allowed: (s) => s.followedAt !== null && !s.assessment,
      run(s) {
        return emit({ ...s, assessment: ASSESSMENT_SAMPLE }, 'C', 'assessment.completed', '模拟口语测评完成', {
          ...ASSESSMENT_SAMPLE, source: '固定演示样本'
        });
      }
    },
    trial: {
      role: 'B', label: '确认体验课完课',
      allowed: (s) => Boolean(s.assessment) && !s.trial,
      run(s) {
        return emit({ ...s, trial: true }, 'B', 'trial.completed', '体验课已完课', { teacher: s.assessment.teacher });
      }
    },
    buy: {
      role: 'C', label: '模拟购买正价课包',
      allowed: (s) => s.trial && !s.order,
      run(s) {
        const order = {
          id: 'O-001', price: PACK.price, lessons: PACK.lessons, tier: s.partner.tier,
          approved: 0, pending: false, refund: null, refunded: 0
        };
        return emit({ ...s, order }, 'C', 'order.created', '模拟订单已创建并冻结课时款', {
          priceInCents: order.price, lessons: order.lessons, tier: order.tier
        });
      }
    },
    submitLesson: {
      role: 'B', label: '提交一节课的质检记录',
      allowed: ({ order }) => Boolean(order && !order.pending && !order.refund && order.approved < order.lessons),
      run(s) {
        const order = { ...s.order, pending: true };
        return emit({ ...s, order }, 'B', 'lesson.submitted', '课堂质检已提交，待总部复核', {
          lesson: order.approved + 1, ...LESSON_SAMPLE, source: '固定演示样本'
        });
      }
    },
    approveLesson: {
      role: 'S', label: '复核通过并解冻一节课',
      allowed: ({ order }) => Boolean(order?.pending && !order.refund),
      run(s) {
        const order = { ...s.order, approved: s.order.approved + 1, pending: false };
        return emit({ ...s, order }, 'S', 'lesson.approved', '已确认消课并生成解冻流水', {
          lesson: order.approved,
          releasedInCents: balances(order).released - balances(s.order).released
        });
      }
    },
    viewReport: {
      role: 'C', label: '打开成长报告',
      allowed: (s) => Boolean(s.order?.approved && !s.reportViewed),
      run(s) {
        return emit({ ...s, reportViewed: true }, 'C', 'report.viewed', '成长报告查看事件已回流总部', {
          approvedLessons: s.order.approved
        });
      }
    },
    refer: {
      role: 'C', label: '生成演示邀请',
      allowed: (s) => s.reportViewed && !s.referred && !s.order.refund,
      run(s) {
        return emit({ ...s, referred: true }, 'C', 'referral.created', '生成转介绍线索，等待好友响应', {
          invitationCode: 'INV-C001', referralLeadId: 'L-002', attributionPartnerId: s.partner.id
        });
      }
    },
    requestRefund: {
      role: 'C', label: '提交模拟退款',
      allowed: ({ order }) => Boolean(order && !order.pending && !order.refund && balances(order).frozen > 0),
      run(s) {
        const order = { ...s.order, refund: 'pending' };
        return emit({ ...s, order }, 'C', 'refund.requested', '家长提交未消课退款，待总部复核', {
          requestedInCents: balances(order).frozen
        });
      }
    },
    approveRefund: {
      role: 'S', label: '复核并确认退款',
      allowed: ({ order }) => order?.refund === 'pending',
      run(s) {
        const refunded = balances(s.order).frozen;
        const order = { ...s.order, refund: 'approved', refunded };
        return emit({ ...s, order }, 'S', 'refund.approved', '剩余冻结课时款已模拟退款', { refundedInCents: refunded });
      }
    }
  };

  function runAction(state, action, role) {
    if (!Object.hasOwn(ACTIONS, action)) return state;
    const definition = ACTIONS[action];
    if (definition.role !== role || !definition.allowed(state)) return state;
    return definition.run({ ...state, clock: state.clock + 60 * 1000 });
  }

  function createState(scenario = 'standard') {
    const preset = Object.hasOwn(CASES, scenario) ? scenario : 'standard';
    const initial = emit({
      scenario: preset, clock: START, lead: LEAD, partner: null, intent: null, assignedAt: null,
      followedAt: null, assessment: null, trial: false, order: null, reportViewed: false, referred: false, events: []
    }, 'S', 'lead.captured', '线索进入总部线索池', { city: LEAD.city, source: LEAD.source });
    return CASES[preset].seed.reduce((state, action) => runAction(state, action, ACTIONS[action].role), initial);
  }

  function nextStep(state) {
    if (state.order?.refund === 'pending') return 'approveRefund';
    if (state.order?.refund === 'approved') return null;
    if (state.order?.pending) return 'approveLesson';
    if (state.scenario === 'refund' && ACTIONS.requestRefund.allowed(state)) return 'requestRefund';
    const path = ['score', 'assign', 'follow', 'assess', 'trial', 'buy'];
    if (!state.order?.approved) path.push('submitLesson', 'approveLesson');
    path.push('viewReport', 'refer');
    return path.find((action) => ACTIONS[action].allowed(state)) || null;
  }

  function metrics(state) {
    const count = (condition) => Number(Boolean(condition));
    return {
      leads: 1 + count(state.referred), assigned: count(state.partner),
      timely: count(slaStatus(state).kind === 'good'), trials: count(state.trial),
      paid: count(state.order), reportViews: count(state.reportViewed), referrals: count(state.referred)
    };
  }

  const api = { ACTIONS, CASES, PACK, PARTNERS, LESSON_SAMPLE, createState, runAction, nextStep, metrics, balances, settlement, scoreLead, routeLead, slaStatus };
  if (typeof module === 'object') module.exports = api;
  else root.Symbiosis = api;
})(globalThis);
