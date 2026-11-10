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
  const ACTORS = { S: '总部', B: '城市合伙人', C: '家长' };
  const TOUR_PHASES = [
    ['接到线索', ['score', 'assign', 'follow']],
    ['完成试听', ['assess', 'trial']],
    ['购课与交付', ['buy', 'submitLesson', 'approveLesson']],
    ['反馈回到总部', ['viewReport', 'refer']]
  ];
  const REFUND_PHASES = [['查看可退金额', ['approveLesson', 'requestRefund']], ['确认退款', ['approveRefund']]];
  const OVERDUE_PHASES = [['补跟进', ['follow']]];
  const TOUR_STEPS = {
    score: ['家长想预约一节试听课', '总部先从家长的留言里判断试听意向，决定是否交给本地合伙人跟进。', '家长留言', (s) => '「' + s.lead.transcript + '」'],
    assign: ['把线索交给同城合伙人', '这条线索被识别为高意向。总部按城市和资质匹配可提供服务的合伙人。', '待派线索', (s) => s.lead.city + ' · ' + s.intent.level + ' · ' + s.intent.score + ' / 100'],
    follow: ['联系家长并约好试听', '合伙人收到线索后登记跟进和预约。总部能看到是否在派单后 48 小时内完成。', '本次跟进', (s) => s.partner.name + ' · ' + slaStatus(s).label],
    assess: ['先了解孩子的口语水平', '家长查看模拟口语测评。测评结果会给出分级、练习建议和匹配的老师。', '已预约试听', (s) => '由 ' + s.partner.name + ' 协助安排'],
    trial: ['确认家长已完成试听', '合伙人确认本次体验完成，家长可以决定是否购买课包。', '本次测评', (s) => s.assessment.level + ' · ' + s.assessment.teacher],
    buy: ['试听满意，家长购买课包', '模拟购课后，课时款先冻结。总部确认一节课交付后，才解冻对应金额。', '演示课包', () => PACK.lessons + ' 节 · ' + amount(PACK.price)],
    submitLesson: ['提交一节课的课堂记录', '合伙人提交课堂记录供总部复核，家长之后可以在成长报告里看到练习建议。', '课堂记录样本', () => '开口率 ' + LESSON_SAMPLE.speakingShare + '% · 纠错质量 ' + LESSON_SAMPLE.correctionQuality + ' / 5'],
    approveLesson: ['总部确认课时交付', '复核通过后，账本解冻这一节课对应的金额，并保留可追溯的记录。', '当前课时款', (s) => amount(balances(s.order).frozen) + ' 冻结中 · 1 节课待复核'],
    viewReport: ['家长收到孩子的成长报告', '报告把课堂观察变成练习建议。总部可以知道家长是否看过报告。', '课时款进度', (s) => '已确认 ' + s.order.approved + ' 节 · 已解冻 ' + amount(balances(s.order).released)],
    refer: ['把体验分享给另一位家长', '生成演示邀请后，总部收到一条新线索，并能追溯它来自哪位合伙人。', '报告中的练习建议', () => LESSON_SAMPLE.practice],
    requestRefund: ['家长申请退回未上课时款', '已确认上完的课时照常结算，剩余冻结款可以提交总部复核。', '本次可退', (s) => amount(balances(s.order).frozen)],
    approveRefund: ['总部复核退款金额', '复核通过后，模拟账本退回剩余冻结款，并记录这笔退款对应的订单。', '待复核金额', (s) => amount(balances(s.order).frozen)]
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
  let screen = 'intro';

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

  function tourStep() {
    if (state.scenario === 'overdue') return ACTIONS.follow.allowed(state) ? 'follow' : null;
    const next = nextStep(state);
    if (state.scenario === 'refund' && !REFUND_PHASES.some(([, actions]) => actions.includes(next))) return null;
    return next;
  }

  function tourResult(refund, overdue) {
    const totals = balances(state.order);
    if (overdue) return ['超时线索已补跟', '合伙人已经预约试听。总部仍保留这次超时记录，可以追踪服务时效。', '48h 内跟进 · 0 / 1'];
    if (state.order?.refund === 'approved') return ['未上课时款已退回', '总部复核后更新了模拟账本。已经完成的课时保留原结算记录。', '已退款 ' + amount(totals.refunded)];
    if (refund) return ['当前订单没有可退余额', '重开课后退款场景，可以体验有余额时的退款流程。', '可退 ' + amount(totals.frozen)];
    return ['一条线索走完了服务闭环', '总部能看到从派单、试听到交付的进度。家长的转介绍回到了总部，可以开启下一次服务。', '1 条转介绍线索已回流'];
  }

  function renderTour() {
    const next = tourStep();
    const refund = state.scenario === 'refund' || Boolean(state.order?.refund);
    const overdue = state.scenario === 'overdue';
    const phases = overdue ? OVERDUE_PHASES : refund ? REFUND_PHASES : TOUR_PHASES;
    const active = next ? phases.findIndex(([, actions]) => actions.includes(next)) : phases.length;
    $('#tour-scenario').textContent = CASES[state.scenario].label;
    $('#tour-phases').innerHTML = phases.map(([label], index) => (
      `<li class="${index < active ? 'phase-done' : ''}" ${index === active ? 'aria-current="step"' : ''}>
        <span aria-hidden="true">${index < active ? '✓' : '0' + (index + 1)}</span>${label}
      </li>`
    )).join('');

    const step = next && TOUR_STEPS[next];
    const [title, description, evidence] = step ? [step[0], step[1], step[3](state)] : tourResult(refund, overdue);
    const caption = step ? step[2] : '演示结果';
    const actor = next && ACTIONS[next].role;
    const latest = state.events.at(-1);
    $('#tour-stage').innerHTML = `<article class="tour-card">
      <div class="tour-copy">
        <p class="role-badge">${actor ? `<b>${actor}</b> 当前角色 · ${ACTORS[actor]}` : '<b aria-hidden="true">✓</b> 本场景已结束'}</p>
        <h1 id="tour-title" tabindex="-1">${title}</h1>
        <p>${description}</p>
        ${next ? action(next) : '<button class="button primary" id="tour-restart" type="button">重新体验</button>'}
      </div>
      <aside class="case-slip"><p class="label">${caption}</p><strong>${escape(evidence)}</strong>
        <p class="case-update">${escape(latest.label)}</p>
      </aside>
    </article>`;
  }

  function renderIntro() {
    $('#start-label').textContent = state.scenario === 'standard' && journal.length && tourStep() ? '继续体验' : '开始体验';
  }

  function showScreen(next) {
    screen = next;
    $('#intro').hidden = screen !== 'intro';
    $('#tour').hidden = screen !== 'tour';
    $('#workbench').hidden = screen !== 'workbench';
    $('#mode-link').textContent = screen === 'workbench' ? '返回引导演示 ←' : '打开工作台 ↗';
    if (screen === 'intro') renderIntro();
    if (screen === 'tour') renderTour();
    if (screen === 'workbench') render();
    const heading = { intro: '#intro-title', tour: '#tour-title', workbench: '#role-title' }[screen];
    $(heading).focus({ preventScroll: true });
    window.scrollTo(0, 0);
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
    if (screen === 'workbench') render(true);
    $('#announcement').textContent = '已载入' + CASES[scenario].label + '场景';
  }

  function performAction(actionId, actor) {
    const updated = runAction(state, actionId, actor);
    if (state === updated) return false;
    state = updated;
    role = actor;
    journal.push(actionId);
    persist();
    $('#announcement').textContent = state.events.at(-1).label;
    return true;
  }

  $('#home-link').addEventListener('click', () => showScreen('intro'));
  $('#tour-back').addEventListener('click', () => showScreen('intro'));
  $('#mode-link').addEventListener('click', () => showScreen(screen === 'workbench' ? 'tour' : 'workbench'));
  $('#intro').addEventListener('click', (event) => {
    const button = event.target.closest('[data-scenario]');
    if (!button) return;
    if (state.scenario !== button.dataset.scenario || !tourStep()) reset(button.dataset.scenario);
    showScreen('tour');
  });
  $('#tour-stage').addEventListener('click', (event) => {
    const restart = event.target.closest('#tour-restart');
    const button = event.target.closest('[data-action]');
    if (restart) reset(state.scenario);
    else if (!button || !performAction(button.dataset.action, ACTIONS[button.dataset.action].role)) return;
    renderTour();
    $('#tour-title').focus({ preventScroll: true });
  });

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
    $(`#role-content [data-action="${next}"]`)?.focus();
  });
  $('#scenario').addEventListener('change', (event) => reset(event.target.value));
  $('#reset').addEventListener('click', () => reset(state.scenario));
  $('#role-content').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (!performAction(button.dataset.action, role)) return;
    render();
    const next = nextStep(state);
    const focus = next && ACTIONS[next].role === role ? $(`#role-content [data-action="${next}"]`) : next ? $('#jump') : $('#reset');
    focus?.focus({ preventScroll: true });
  });

  renderIntro();
})();
