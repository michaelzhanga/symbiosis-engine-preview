(function () {
  'use strict';

  const {
    ACTIONS, CASES, PACK, PARTNERS, LESSON_SAMPLE, createState, runAction, nextStep, metrics, balances, settlement, slaStatus
  } = globalThis.Symbiosis;
  const $ = (selector) => document.querySelector(selector);
  const STORE = 'symbiosis-engine-demo-v1';
  const ROLES = {
    S: ['总部驾驶舱', 'HEADQUARTERS', '从一条线索开始，看城市合伙人和家长的服务数据如何回到总部。'],
    B: ['合伙人工作台', 'CITY PARTNER', '接收本地线索，完成 48 小时跟进，将课堂记录提交总部复核。'],
    C: ['家长端', 'FAMILY', '从口语测评到成长报告，查看每一节课对应的资金进度。']
  };
  const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
  const date = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const amount = (cents) => money.format(cents / 100);
  const time = (at) => date.format(new Date(at));
  const escape = (value) => String(value).replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
  ));

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (saved && Object.hasOwn(CASES, saved.scenario) && Object.hasOwn(ROLES, saved.role) && Array.isArray(saved.journal)) {
        const journal = saved.journal.filter((action) => Object.hasOwn(ACTIONS, action)).slice(0, 100);
        const initial = createState(saved.scenario);
        return {
          state: journal.reduce((current, action) => runAction(current, action, ACTIONS[action].role), initial),
          role: saved.role,
          journal
        };
      }
    } catch {
      // A blocked or corrupt browser store still permits an in-memory demo.
    }
    return { state: createState(), role: 'S', journal: [] };
  }

  let { state, role, journal } = restore();

  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ scenario: state.scenario, role, journal }));
    } catch {
      // Some browsers disable localStorage for file://. The current session remains usable.
    }
  }

  function action(id, primary = true) {
    const definition = ACTIONS[id];
    return `<button class="button ${primary ? 'primary' : 'secondary'}" type="button" data-action="${id}" ${definition.allowed(state) ? '' : 'disabled'}>${definition.label}</button>`;
  }

  function pill(label, tone = '') {
    return `<span class="pill ${tone}">${escape(label)}</span>`;
  }

  function record(items) {
    return `<dl class="record">${items.map(([name, value]) => (
      `<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`
    )).join('')}</dl>`;
  }

  function card(code, title, body, tag = '') {
    return `<section class="card">
      <div class="section-head"><div><p class="kicker">${code}</p><h2>${title}</h2></div>${tag}</div>
      ${body}
    </section>`;
  }

  function displayMetrics() {
    const m = metrics(state);
    const rows = [
      ['已派线索', m.assigned + ' / ' + m.leads, '分母含待响应转介绍'],
      ['48h 内跟进', m.assigned ? m.timely + ' / ' + m.assigned : '—', '分母为已派线索'],
      ['体验 → 付费', m.trials ? m.paid + ' / ' + m.trials : '—', '按历史成交计'],
      ['转介绍线索', m.referrals, '尚未产生新体验']
    ];
    return `<p class="muted">实时读取当前场景事件。真实试点的续费率、CAC、NPS 和渠道活跃率待回填。</p>
      <dl class="metrics">${rows.map(([name, value, caption]) => (
        `<div class="metric"><dt>${name}</dt><dd>${value}</dd><small>${caption}</small></div>`
      )).join('')}</dl>`;
  }

  function showLedger() {
    const o = state.order;
    const totals = balances(o);
    return `<dl class="ledger">
      <div class="metric"><dt>冻结中</dt><dd>${amount(totals.frozen)}</dd></div>
      <div class="metric"><dt>累计解冻</dt><dd>${amount(totals.released)}</dd></div>
      <div class="metric"><dt>已退款</dt><dd>${amount(totals.refunded)}</dd></div>
    </dl>
    <label class="muted" for="lesson-progress">确认消课 ${o.approved} / ${o.lessons} 节 · ${o.id}</label>
    <progress class="progress" id="lesson-progress" value="${o.approved}" max="${o.lessons}"></progress>
    <p class="muted">原始课包 ${amount(o.price)} · 已确认课时逐节解冻 · 模拟退款按剩余冻结额计算</p>`;
  }

  function headquarters() {
    const { lead, intent, partner, order } = state;
    const leadBody = `${record([['线索编号', lead.id], ['试点城市', lead.city], ['来源', lead.source]])}
      <div class="quote"><p class="muted">外呼转写样本 · AI 意向识别环节模拟</p><p>「${escape(lead.transcript)}」</p></div>
      ${intent ? `<p class="muted">${intent.level} · ${intent.score} / 100 · ${intent.hits.map((hit) => hit.label + ' +' + hit.points).join(' / ')}</p>` : ''}
      ${partner ? `<p class="muted">已派给 ${partner.name}（${partner.id}）· ${slaStatus(state).label}</p>` : ''}
      <div class="actions">${action('score')}${action('assign', Boolean(intent))}</div>
      <details class="details"><summary>查看派单规则与候选人</summary>
        <p>高意向线索进入自动派单队列，匹配同城且通过培训认证的合伙人。样本内按候选顺序选择首位。</p>
        <ul>${PARTNERS.map((p) => `<li>${p.id} · ${p.name} · ${p.city} · ${p.certified ? '已认证' : '待认证'}</li>`).join('')}</ul>
      </details>`;
    const review = order ? card('FINANCE', '课消与退款复核', `
      ${showLedger()}
      <div class="actions">${action('approveLesson')}${action('approveRefund', order.refund === 'pending')}</div>`,
      order.refund === 'pending' || order.pending ? pill('待复核', 'warn') : pill('模拟账本')) : '';
    const architecture = card('ARCHITECTURE', '五层技术架构', `
      <details class="details"><summary>查看这条线索如何跨端流转</summary>
        <ol class="steps">
          <li>采集 · 接收外呼样本、跟进、测评、消课及订单事件</li>
          <li>治理 · 用学员 ID、合伙人 ID、订单 ID 关联事件</li>
          <li>算法 · 规则模拟意向识别和派单，测评与巡课采用固定输出</li>
          <li>应用 · 智能营销、渠道赋能、学习服务、交易结算四个中台</li>
          <li>触点 · 总部、城市合伙人和家长三端共享一套演示状态</li>
        </ol>
      </details>`);
    return card('LEAD POOL', '线索池与意向识别', leadBody,
      partner ? pill('已派单', 'good') : pill(intent ? intent.level : '待识别', intent ? 'good' : '')) +
      review + card('PILOT FUNNEL', '试点漏斗', displayMetrics(), pill('当前场景')) + architecture;
  }

  function partnerDesk() {
    const { partner, lead, assessment, trial, followedAt, order } = state;
    if (!partner) {
      return card('INBOX', '我的线索', '<p class="muted">暂无线索。请先在总部完成意向识别和派单。</p>', pill('等待派单'));
    }
    const sla = slaStatus(state);
    const leadBody = `${record([['当前合伙人', partner.name], ['归属线索', lead.id], ['跟进截止', time(sla.deadline)]])}
      <div class="quote"><p class="muted">邀约话术示例 · 规则模板</p>
        <p>可以先做一次口语测评。您提到周六下午方便，我可以按测评结果帮您安排体验。</p></div>
      <p class="muted">${followedAt === null ? '按派单时间起算 48h，可推进演示时钟查看超时状态。' : '预约已记录 · ' + time(followedAt)}</p>
      <div class="actions">${action('follow')}${action('fastForward', false)}</div>`;
    const classroom = card('CLASSROOM', '体验课与巡课质检', `
      <p class="muted">${assessment ? '匹配老师 · ' + assessment.teacher : '等待家长查看口语测评结果。'}</p>
      <div class="actions">${action('trial')}${action('submitLesson', Boolean(order))}</div>
      ${order?.pending || order?.approved ? `<div class="quote">
        <p class="muted">AI 巡课固定样本 · ${order.pending ? '待总部复核' : '已复核'}</p>
        <p>学员开口率 ${LESSON_SAMPLE.speakingShare}% · 纠错质量 ${LESSON_SAMPLE.correctionQuality}/5</p>
        <p>${escape(LESSON_SAMPLE.correction)}</p></div>` : ''}`,
      trial ? pill('体验已完课', 'good') : pill('待体验'));
    let finance = '';
    if (order) {
      const { headquarters: net, margin, reserve } = settlement(order.price - order.refunded, order.tier);
      finance = card('CHANNEL ECONOMICS', '渠道结算测算', `
        ${record([['总部收入', amount(net)], ['渠道批零差价', amount(margin)], ['激励预留', amount(reserve)]])}
        <p class="muted">${order.tier / 10} 折供货档 · 按课包价扣已退款金额测算 · 预留 ${PACK.incentive}% 服务与推荐激励，演示未发放 · 未扣履约与税费</p>`, pill('测算'));
    }
    return card('INBOX', '我的线索与跟进', leadBody, pill(sla.label, sla.kind)) + classroom + finance;
  }

  function family() {
    const { assessment, followedAt, trial, order, reportViewed, referred } = state;
    const learning = card('LEARNING', '我的口语学习', `
      ${assessment ? record([['学员 ID', state.lead.studentId], ['口语分级（样本）', assessment.level], ['匹配老师', assessment.teacher]]) : ''}
      <p class="muted">${assessment ? assessment.advice : followedAt === null
        ? '合伙人确认预约后即可体验口语测评。'
        : '本次用固定样本展示分级和学习建议。'}</p>
      <div class="actions">${action('assess')}${action('buy', trial)}</div>
      ${trial && !order ? `<p class="muted">演示正价包 ${amount(PACK.price)} / ${PACK.lessons} 节，购买后资金先冻结。</p>` : ''}`,
      trial ? pill('体验已完课', 'good') : pill('测评与体验'));
    if (!order) return learning;
    const refundStatus = {
      pending: '退款待总部复核',
      approved: '退款已确认'
    }[order.refund];
    const finance = card('TUITION LEDGER', '我的课时款', `
      ${showLedger()}
      ${order.pending ? '<p class="muted">有待复核课时，请在总部处理后再申请退款。</p>' : ''}
      <div class="actions">${action('requestRefund', state.scenario === 'refund')}</div>`,
      pill(refundStatus || '模拟存管', order.refund === 'pending' ? 'warn' : ''));
    const report = card('PROGRESS', '成长报告与转介绍', `
      <p class="muted">${order.approved ? '总部已复核课堂记录。打开报告后，查看行为会回流总部。' : '首节课复核后可查看成长报告。'}</p>
      ${reportViewed ? `<div class="quote"><p>口语课堂样本 · 开口率 ${LESSON_SAMPLE.speakingShare}%</p>
        <p>${escape(LESSON_SAMPLE.correction)}</p><p>${LESSON_SAMPLE.practice}</p></div>` : ''}
      ${referred ? '<p class="muted">邀请编号 INV-C001 · 归属原合伙人 · 新线索待好友响应</p>' : ''}
      <div class="actions">${action('viewReport')}${action('refer', reportViewed)}</div>`,
      pill(reportViewed ? '已查看' : '课堂样本', reportViewed ? 'good' : ''));
    return learning + finance + report;
  }

  function renderEvents(clear) {
    const timeline = $('#events');
    const open = new Set(clear ? [] : [...timeline.querySelectorAll('details[open]')].map((entry) => entry.dataset.event));
    $('#event-count').textContent = state.events.length + ' 条';
    timeline.innerHTML = [...state.events].reverse().map(({ id, role: origin, type, label, at, ids, details }) => (
      `<li><details data-event="${id}" ${open.has(id) ? 'open' : ''}>
        <summary><span class="event-role">${origin}</span>
          <span><span class="event-name">${escape(label)}</span><time class="event-time" datetime="${at}">${time(at)} · ${id}</time></span>
        </summary>
        <pre>${escape(JSON.stringify({ type, ...ids, ...details }, null, 2))}</pre>
      </details></li>`
    )).join('');
  }

  function render(clearEvents = false) {
    const [name, kicker, description] = ROLES[role];
    $('#role-kicker').textContent = role + ' · ' + kicker;
    $('#role-title').textContent = name;
    $('#role-description').textContent = description;
    $('#scenario').value = state.scenario;
    for (const button of document.querySelectorAll('#roles button')) {
      if (button.dataset.role === role) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
    const next = ACTIONS[nextStep(state)];
    $('#guide-text').textContent = next
      ? ROLES[next.role][0] + ' · ' + next.label
      : state.order?.refund === 'approved' ? '退款流程完成，可展开事件查看金额与订单 ID。' : '闭环完成，可回总部查看转介绍线索。';
    $('#jump').hidden = !next;
    $('#jump').textContent = next?.role === role ? '定位操作' : '切换到该端';
    $('#role-content').innerHTML = { S: headquarters, B: partnerDesk, C: family }[role]();
    renderEvents(clearEvents);
  }

  function reset(scenario) {
    state = createState(scenario);
    role = CASES[scenario].role;
    journal = [];
    persist();
    render(true);
    $('#announcement').textContent = '已载入' + CASES[scenario].label + '场景';
  }

  $('#roles').addEventListener('click', (event) => {
    const button = event.target.closest('[data-role]');
    if (button) {
      role = button.dataset.role;
      persist();
      render();
    }
  });
  $('#jump').addEventListener('click', () => {
    const next = nextStep(state);
    if (!next) return;
    role = ACTIONS[next].role;
    persist();
    render();
    $(`[data-action="${next}"]`)?.focus();
  });
  $('#scenario').addEventListener('change', (event) => reset(event.target.value));
  $('#reset').addEventListener('click', () => reset(state.scenario));
  $('#role-content').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const actionId = button.dataset.action;
    const updated = runAction(state, actionId, role);
    if (state === updated) return;
    state = updated;
    journal.push(actionId);
    persist();
    render();
    $('#announcement').textContent = state.events.at(-1).label;
    const next = nextStep(state);
    const focus = next && ACTIONS[next].role === role ? $(`[data-action="${next}"]`) : next ? $('#jump') : $('#reset');
    focus?.focus({ preventScroll: true });
  });

  render();
})();
