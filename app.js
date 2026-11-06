(function () {
  'use strict';

  const STORAGE_KEY = 'hrm_study_state_v1';

  // Data from data.js
  const chapters = (window.HRM_DATA && window.HRM_DATA.chapters) ? window.HRM_DATA.chapters : [];

  // Build lookup maps
  const chapterMap = {};
  const topicMap = {};
  const questionMap = {};
  let totalQuestionsCount = 0;

  chapters.forEach((ch) => {
    chapterMap[ch.chapter] = ch;
    (ch.topics || []).forEach((t) => {
      topicMap[t.id] = Object.assign({}, t, { chapter: ch.chapter, chapterTitle: ch.title });
    });
    (ch.questions || []).forEach((q) => {
      const fullQ = Object.assign({}, q, {
        chapter: ch.chapter,
        chapterTitle: ch.title
      });
      questionMap[q.id] = fullQ;
      totalQuestionsCount++;
    });
  });

  // Persistent user state
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          answers: parsed.answers || {},       // { [qId]: 'A' | 'B' | 'C' | 'D' }
          mistakes: parsed.mistakes || {},     // { [qId]: true } (active wrong choices)
          everWrong: parsed.everWrong || {},   // { [qId]: { wrongCount, wrongChoices, lastWrongChoice, firstWrongAt, lastWrongAt } }
          bookmarks: parsed.bookmarks || {},   // { [qId]: true }
          readTopics: parsed.readTopics || {}, // { [topicId]: true }
          examHistory: parsed.examHistory || []
        };
      }
    } catch (e) {
      console.warn('Could not load saved state:', e);
    }
    return {
      answers: {},
      mistakes: {},
      everWrong: {},
      bookmarks: {},
      readTopics: {},
      examHistory: []
    };
  }

  let userState = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userState));
    } catch (e) {
      console.warn('Could not save state:', e);
    }
    updateSidebarStats();
  }

  // Centralized helper to record an answer and track past mistakes
  function recordUserAnswer(qId, letter) {
    const q = questionMap[qId];
    if (!q) return;

    const isCorrect = (letter === q.answer);
    userState.answers[qId] = letter;

    if (!isCorrect) {
      userState.mistakes[qId] = true;
      if (!userState.everWrong) userState.everWrong = {};
      if (!userState.everWrong[qId]) {
        userState.everWrong[qId] = {
          wrongCount: 0,
          wrongChoices: [],
          lastWrongChoice: letter,
          firstWrongAt: Date.now()
        };
      }
      userState.everWrong[qId].wrongCount = (userState.everWrong[qId].wrongCount || 0) + 1;
      if (!userState.everWrong[qId].wrongChoices) userState.everWrong[qId].wrongChoices = [];
      if (!userState.everWrong[qId].wrongChoices.includes(letter)) {
        userState.everWrong[qId].wrongChoices.push(letter);
      }
      userState.everWrong[qId].lastWrongChoice = letter;
      userState.everWrong[qId].lastWrongAt = Date.now();
    } else {
      // Remove from active mistakes, BUT NEVER remove from everWrong!
      // This ensures mistakes are remembered for post-chapter review.
      delete userState.mistakes[qId];
    }
    saveState();
  }

  // Current UI Navigation State
  let uiState = {
    view: 'overview',          // 'overview' | 'chapter' | 'mistakes' | 'bookmarks' | 'exam' | 'search'
    activeChapter: 1,
    chapterTab: 'theory',      // 'theory' | 'practice' | 'quiz'
    practiceTopic: 'all',      // 'all' | topicId
    practiceFilter: 'all',     // 'all' | 'unanswered' | 'wrong' | 'bookmarked'
    practiceMode: 'list',      // 'list' | 'single'
    singleIndex: 0,
    shuffledIds: null,         // array of qIds when shuffled
    searchQuery: '',
    // Exam state
    examActive: false,
    examSubmitted: false,
    examQuestions: [],
    examAnswers: {},
    examTimeLeft: 0,
    examTimerId: null,
    examConfig: {
      count: 40,
      minutes: 45,
      selectedChapters: chapters.map((c) => c.chapter)
    }
  };

  // DOM Elements
  const mainContent = document.getElementById('mainContent');
  const chapterNavList = document.getElementById('chapterNavList');
  const mistakesCountBadge = document.getElementById('mistakesCountBadge');
  const bookmarksCountBadge = document.getElementById('bookmarksCountBadge');
  const sidebarProgressText = document.getElementById('sidebarProgressText');
  const sidebarProgressBar = document.getElementById('sidebarProgressBar');
  const globalSearchInput = document.getElementById('globalSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const sidebar = document.getElementById('sidebar');
  const mobileHeaderTitle = document.getElementById('mobileHeaderTitle');

  // Modal Elements
  const theoryModalBackdrop = document.getElementById('theoryModalBackdrop');
  const theoryModalChapter = document.getElementById('theoryModalChapter');
  const theoryModalTitle = document.getElementById('theoryModalTitle');
  const theoryModalBody = document.getElementById('theoryModalBody');

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const ICONS = {
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    cross: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="6"/></svg>',
    book: '<svg width="13.5" height="13.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    bulb: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>',
    star: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    starFilled: '<svg width="13" height="13" viewBox="0 0 24 24" fill="#d97706" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    retry: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
    arrowRight: '<svg width="13.5" height="13.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'
  };

  // Update Sidebar & Progress
  function updateSidebarStats() {
    const answeredCount = Object.keys(userState.answers).length;
    const everWrongList = Object.keys(userState.everWrong || {}).filter((k) => userState.everWrong[k] && userState.everWrong[k].wrongCount > 0);
    const bookmarkCount = Object.keys(userState.bookmarks || {}).filter((k) => userState.bookmarks[k]).length;

    mistakesCountBadge.textContent = everWrongList.length;
    bookmarksCountBadge.textContent = bookmarkCount;
    sidebarProgressText.textContent = `${answeredCount} / ${totalQuestionsCount} câu`;
    const pct = totalQuestionsCount > 0 ? Math.round((answeredCount / totalQuestionsCount) * 100) : 0;
    sidebarProgressBar.style.width = `${pct}%`;

    // Render chapter nav items
    chapterNavList.innerHTML = chapters.map((ch) => {
      const chQuestions = ch.questions || [];
      const chAnswered = chQuestions.filter((q) => userState.answers[q.id]).length;
      const chPct = chQuestions.length > 0 ? Math.round((chAnswered / chQuestions.length) * 100) : 0;
      const chTopics = ch.topics || [];
      const readCount = chTopics.filter((t) => userState.readTopics[t.id]).length;
      const allRead = chTopics.length > 0 && readCount === chTopics.length;
      const isActive = uiState.view === 'chapter' && uiState.activeChapter === ch.chapter;

      return `
        <button class="chapter-nav-item ${isActive ? 'active' : ''}" data-chapter="${ch.chapter}">
          <div class="chapter-nav-top">
            <span class="chapter-nav-title">Chương ${ch.chapter}: ${escapeHtml(ch.title)}</span>
          </div>
          <div class="chapter-nav-meta">
            <span class="theory-status-dot ${allRead ? 'read' : ''}">
              ${allRead ? '✓ Đã đọc LT' : `📖 LT: ${readCount}/${chTopics.length}`}
            </span>
            <span>${chAnswered}/${chQuestions.length} câu</span>
          </div>
          <div class="mini-progress-bg">
            <div class="mini-progress-fill" style="width: ${chPct}%"></div>
          </div>
        </button>
      `;
    }).join('');

    // Highlight top-level nav buttons
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((btn) => {
      const v = btn.getAttribute('data-view');
      btn.classList.toggle('active', uiState.view === v);
    });
  }

  // Open Theory Modal for Quick Reference during Quiz
  function openTheoryModal(topicId) {
    const topic = topicMap[topicId];
    if (!topic) return;
    theoryModalChapter.textContent = `Chương ${topic.chapter}: ${topic.chapterTitle}`;
    theoryModalTitle.textContent = topic.title;
    const takeawaysHtml = (topic.key_takeaways && topic.key_takeaways.length)
      ? `
        <div class="takeaways-box">
          <div class="takeaways-title">Điểm cốt lõi cần nhớ</div>
          <ul class="takeaways-list">
            ${topic.key_takeaways.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      `
      : '';
    theoryModalBody.innerHTML = `
      <div class="theory-rich-content">
        ${topic.content_html || ''}
      </div>
      ${takeawaysHtml}
    `;
    theoryModalBackdrop.classList.remove('hidden');
  }

  function closeTheoryModal() {
    theoryModalBackdrop.classList.add('hidden');
  }

  // Navigate helper
  function navigateTo(view, opts = {}) {
    if (uiState.examTimerId && view !== 'exam') {
      clearInterval(uiState.examTimerId);
      uiState.examTimerId = null;
    }
    uiState.view = view;
    if (opts.chapter !== undefined) {
      uiState.activeChapter = opts.chapter;
    }
    if (opts.chapterTab !== undefined) {
      uiState.chapterTab = opts.chapterTab;
    }
    if (opts.practiceTopic !== undefined) {
      uiState.practiceTopic = opts.practiceTopic;
    }
    if (opts.practiceFilter !== undefined) {
      uiState.practiceFilter = opts.practiceFilter;
    }
    if (opts.resetShuffle) {
      uiState.shuffledIds = null;
      uiState.singleIndex = 0;
    }
    sidebar.classList.remove('open');
    updateSidebarStats();
    renderMain();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Render Main View Dispatcher
  function renderMain() {
    if (uiState.view === 'overview') {
      mobileHeaderTitle.textContent = 'Tổng quan & Bản chất môn học';
      renderOverview();
    } else if (uiState.view === 'chapter') {
      const ch = chapterMap[uiState.activeChapter];
      mobileHeaderTitle.textContent = ch ? `Chương ${ch.chapter}: ${ch.title}` : 'Chương học';
      renderChapterView(ch);
    } else if (uiState.view === 'mistakes') {
      mobileHeaderTitle.textContent = 'Câu làm sai cần ôn lại';
      renderCollectionView('mistakes');
    } else if (uiState.view === 'bookmarks') {
      mobileHeaderTitle.textContent = 'Câu đã đánh dấu';
      renderCollectionView('bookmarks');
    } else if (uiState.view === 'exam') {
      mobileHeaderTitle.textContent = 'Thi thử Cuối kỳ';
      renderExamView();
    } else if (uiState.view === 'search') {
      mobileHeaderTitle.textContent = `Tìm kiếm: "${uiState.searchQuery}"`;
      renderSearchView();
    }
  }

  // 1. OVERVIEW VIEW
  function renderOverview() {
    const answeredCount = Object.keys(userState.answers).length;
    let correctCount = 0;
    Object.keys(userState.answers).forEach((qId) => {
      const q = questionMap[qId];
      if (q && userState.answers[qId] === q.answer) {
        correctCount++;
      }
    });
    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

    let totalTopics = 0;
    let readTopicsCount = 0;
    chapters.forEach((c) => {
      (c.topics || []).forEach((t) => {
        totalTopics++;
        if (userState.readTopics[t.id]) readTopicsCount++;
      });
    });

    const everWrongCount = Object.keys(userState.everWrong || {}).filter((k) => userState.everWrong[k] && userState.everWrong[k].wrongCount > 0).length;

    mainContent.innerHTML = `
      <div class="page-header">
        <span class="page-eyebrow">Chuẩn Giáo trình HUB • PGS.TS. Trần Kim Dung (Khoa Quản trị Kinh doanh)</span>
        <h2 class="page-title">Học Bản Chất Môn Quản Trị Nguồn Nhân Lực (HUB)</h2>
        <p class="page-desc">
          Toàn bộ lý thuyết và giải thích được biên soạn chuẩn xác 100% theo <strong>Giáo trình Quản trị nguồn nhân lực của PGS.TS. Trần Kim Dung</strong> (giáo trình chính thống tại Thư viện Trường Đại học Ngân hàng TP.HCM - HUB, ký hiệu 658.3) và các học thuyết nhân sự quốc tế trong đề cương môn học của HUB.
        </p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Chủ đề Lý thuyết đã đọc</div>
          <div class="stat-value">${readTopicsCount} / ${totalTopics}</div>
          <div class="stat-sub">Nền tảng hiểu bản chất</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Câu hỏi đã luyện tập</div>
          <div class="stat-value">${answeredCount} / ${totalQuestionsCount}</div>
          <div class="stat-sub">Trích từ file Trắc nghiệm.pdf</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Tỷ lệ trả lời đúng</div>
          <div class="stat-value">${accuracy}%</div>
          <div class="stat-sub">${correctCount} câu đúng</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Câu từng sai cần ôn lại</div>
          <div class="stat-value" style="color: ${everWrongCount > 0 ? '#b45309' : 'var(--success)'}">${everWrongCount}</div>
          <div class="stat-sub">${everWrongCount > 0 ? '<a href="#" id="goMistakesLink" style="color:var(--primary)">Ôn lại ngay →</a>' : 'Chưa có câu nào từng sai'}</div>
        </div>
      </div>

      <div class="essence-banner">
        <div class="essence-banner-title">💡 Bản chất cốt lõi của môn học trong 1 phút</div>
        <div class="essence-banner-text">
          <strong>Quản trị nguồn nhân lực (HRM)</strong> thực chất là việc giải quyết bài toán: Làm sao để tổ chức luôn có <strong>đúng số lượng người, đúng kỹ năng, ở đúng vị trí, vào đúng thời điểm</strong>, đồng thời <strong>thỏa mãn cả nhu cầu vật chất lẫn tinh thần</strong> để người lao động cống hiến tối đa cho mục tiêu chiến lược của doanh nghiệp. Mọi hoạt động của HRM đều quy về <strong>3 nhóm chức năng cốt lõi</strong> dưới đây:
        </div>
      </div>

      <div class="card">
        <div class="card-title">🔗 Chuỗi liên kết 3 Nhóm chức năng & 8 Chương học</div>
        <div class="system-pillars">
          <div class="pillar-box">
            <div class="pillar-step">Nhóm chức năng 1</div>
            <div class="pillar-title">Thu Hút Nguồn Nhân Lực</div>
            <div class="pillar-desc">
              Xác định triết lý quản lý con người, phân tích xem công việc cần làm gì, dự báo thiếu/thừa bao nhiêu người và tuyển đúng người vào tổ chức.
            </div>
            <div class="pillar-chapters">
              <button class="pillar-chap-btn" data-goto-chapter="1"><strong>Chương 1:</strong> Tổng quan & Triết lý QTNNL (59 câu)</button>
              <button class="pillar-chap-btn" data-goto-chapter="2"><strong>Chương 2:</strong> Phân tích & Thiết kế công việc (60 câu)</button>
              <button class="pillar-chap-btn" data-goto-chapter="3"><strong>Chương 3:</strong> Hoạch định nguồn nhân lực (64 câu)</button>
              <button class="pillar-chap-btn" data-goto-chapter="4"><strong>Chương 4:</strong> Tuyển mộ & Tuyển chọn (64 câu)</button>
            </div>
          </div>

          <div class="pillar-box">
            <div class="pillar-step">Nhóm chức năng 2</div>
            <div class="pillar-title">Đào Tạo & Phát Triển</div>
            <div class="pillar-desc">
              Sau khi tuyển người vào, tổ chức cần định hướng hội nhập, đào tạo kỹ năng làm việc, phát triển lộ trình sự nghiệp và đánh giá hiệu suất công bằng.
            </div>
            <div class="pillar-chapters">
              <button class="pillar-chap-btn" data-goto-chapter="5"><strong>Chương 5:</strong> Đào tạo & Phát triển NNL (59 câu)</button>
              <button class="pillar-chap-btn" data-goto-chapter="6"><strong>Chương 6:</strong> Đánh giá thực hiện công việc (65 câu)</button>
            </div>
          </div>

          <div class="pillar-box">
            <div class="pillar-step">Nhóm chức năng 3</div>
            <div class="pillar-title">Duy Trì Nguồn Nhân Lực</div>
            <div class="pillar-desc">
              Kích thích, động viên và giữ chân nhân tài thông qua hệ thống lương thưởng, phúc lợi công bằng, môi trường làm việc an toàn và quan hệ lao động lành mạnh.
            </div>
            <div class="pillar-chapters">
              <button class="pillar-chap-btn" data-goto-chapter="7"><strong>Chương 7:</strong> Đãi ngộ & Trả công lao động (60 câu)</button>
              <button class="pillar-chap-btn" data-goto-chapter="8"><strong>Chương 8:</strong> An toàn, Sức khỏe & QHLĐ (60 câu)</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📚 Danh sách chi tiết 8 Chương (Chọn chương để Đọc Lý thuyết → Làm Trắc nghiệm)</div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          ${chapters.map((ch) => {
            const totalQ = (ch.questions || []).length;
            const doneQ = (ch.questions || []).filter((q) => userState.answers[q.id]).length;
            const correctQ = (ch.questions || []).filter((q) => userState.answers[q.id] === q.answer).length;
            const totalT = (ch.topics || []).length;
            const readT = (ch.topics || []).filter((t) => userState.readTopics[t.id]).length;
            return `
              <div style="border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:16px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; background:var(--bg-page);">
                <div style="flex:1; min-width:240px;">
                  <div style="font-size:15.5px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">
                    Chương ${ch.chapter}: ${escapeHtml(ch.title)}
                  </div>
                  <div style="font-size:13.5px; color:var(--text-secondary); margin-bottom:8px;">
                    ${escapeHtml(ch.short_desc || '')}
                  </div>
                  <div style="font-size:12px; color:var(--text-muted); display:flex; gap:16px; flex-wrap:wrap;">
                    <span>📖 Lý thuyết: <strong>${readT}/${totalT} chủ đề</strong></span>
                    <span>✍️ Trắc nghiệm: <strong>${doneQ}/${totalQ} câu</strong> (${doneQ > 0 ? `Đúng ${correctQ}/${doneQ}` : 'Chưa làm'})</span>
                  </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button class="btn btn-primary btn-sm" data-open-theory="${ch.chapter}">
                    📖 1. Đọc Lý thuyết
                  </button>
                  <button class="btn btn-sm" data-open-practice="${ch.chapter}">
                    ✍️ 2. Làm Trắc nghiệm (${totalQ})
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Bind events in overview
    const goMistakesLink = document.getElementById('goMistakesLink');
    if (goMistakesLink) {
      goMistakesLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('mistakes');
      });
    }
    mainContent.querySelectorAll('[data-goto-chapter], [data-open-theory]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cnum = parseInt(btn.getAttribute('data-goto-chapter') || btn.getAttribute('data-open-theory'), 10);
        navigateTo('chapter', { chapter: cnum, chapterTab: 'theory', practiceTopic: 'all', resetShuffle: true });
      });
    });
    mainContent.querySelectorAll('[data-open-practice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cnum = parseInt(btn.getAttribute('data-open-practice'), 10);
        navigateTo('chapter', { chapter: cnum, chapterTab: 'practice', practiceTopic: 'all', resetShuffle: true });
      });
    });
  }

  // 2. CHAPTER VIEW (Step 1: Theory -> Step 2: Practice -> Step 3: Chapter Quiz)
  function renderChapterView(ch) {
    if (!ch) return;
    const totalQ = (ch.questions || []).length;
    const doneQ = (ch.questions || []).filter((q) => userState.answers[q.id]).length;
    const totalT = (ch.topics || []).length;
    const readT = (ch.topics || []).filter((t) => userState.readTopics[t.id]).length;

    let tabBodyHtml = '';
    if (uiState.chapterTab === 'theory') {
      tabBodyHtml = renderChapterTheoryTab(ch);
    } else {
      tabBodyHtml = renderChapterPracticeTab(ch);
    }

    mainContent.innerHTML = `
      <div class="page-header">
        <span class="page-eyebrow">Chương ${ch.chapter} • Chuẩn Giáo trình HUB • ${totalT} chủ đề lý thuyết • ${totalQ} câu trắc nghiệm</span>
        <h2 class="page-title">Chương ${ch.chapter}: ${escapeHtml(ch.title)}</h2>
        <p class="page-desc">${escapeHtml(ch.short_desc || '')}</p>
      </div>

      <div class="chapter-tabs">
        <button class="chapter-tab-btn ${uiState.chapterTab === 'theory' ? 'active' : ''}" data-ch-tab="theory">
          📖 Bước 1: Đọc Lý thuyết & Bản chất (${readT}/${totalT})
        </button>
        <button class="chapter-tab-btn ${uiState.chapterTab === 'practice' ? 'active' : ''}" data-ch-tab="practice">
          ✍️ Bước 2: Làm Trắc nghiệm & Ôn tập (${doneQ}/${totalQ} câu)
        </button>
      </div>

      <div id="chapterTabContainer">
        ${tabBodyHtml}
      </div>
    `;

    // Bind tab switching
    mainContent.querySelectorAll('[data-ch-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-ch-tab');
        uiState.chapterTab = tab;
        renderChapterView(ch);
      });
    });

    if (uiState.chapterTab === 'theory') {
      bindTheoryTabEvents(ch);
    } else {
      bindPracticeTabEvents(ch);
    }
  }

  function renderChapterTheoryTab(ch) {
    const topics = ch.topics || [];
    const questions = ch.questions || [];

    return `
      <div class="essence-banner">
        <div class="essence-banner-title">🎯 Bản chất cốt lõi Chương ${ch.chapter}</div>
        <div class="essence-banner-text">${ch.core_essence || escapeHtml(ch.short_desc || '')}</div>
      </div>

      ${topics.map((t) => {
        const isRead = !!userState.readTopics[t.id];
        const topicQuestions = questions.filter((q) => q.topic_id === t.id);
        const topicDone = topicQuestions.filter((q) => userState.answers[q.id]).length;
        const takeawaysHtml = (t.key_takeaways && t.key_takeaways.length)
          ? `
            <div class="takeaways-box">
              <div class="takeaways-title">📌 Điểm cốt lõi cần nhớ khi làm bài</div>
              <ul class="takeaways-list">
                ${t.key_takeaways.map((kw) => `<li>${escapeHtml(kw)}</li>`).join('')}
              </ul>
            </div>
          `
          : '';

        return `
          <article class="topic-card ${isRead ? 'is-read' : ''}" id="topic-${t.id}">
            <div class="topic-card-header">
              <div>
                <h3 class="topic-card-title">${escapeHtml(t.title)}</h3>
                <div class="topic-card-summary">${escapeHtml(t.summary || '')}</div>
              </div>
              <span class="nav-badge">${topicQuestions.length} câu hỏi</span>
            </div>
            <div class="topic-card-body">
              <div class="theory-rich-content">
                ${t.content_html || ''}
              </div>
              ${takeawaysHtml}
            </div>
            <div class="topic-card-footer">
              <button class="btn btn-sm ${isRead ? 'btn-success' : ''}" data-toggle-read="${t.id}">
                ${isRead ? '✓ Đã hiểu chủ đề này' : 'Đánh dấu: Đã hiểu lý thuyết'}
              </button>
              <button class="btn btn-primary btn-sm" data-practice-topic="${t.id}">
                ✍️ Luyện ngay ${topicQuestions.length} câu của chủ đề này (${topicDone}/${topicQuestions.length}) →
              </button>
            </div>
          </article>
        `;
      }).join('')}

      <div class="card" style="text-align:center; background:var(--bg-highlight); border-color:var(--primary-soft);">
        <h3 style="font-size:17px; margin-bottom:6px;">Bạn đã nắm được bức tranh lý thuyết của Chương ${ch.chapter}?</h3>
        <p style="font-size:14px; color:var(--text-secondary); margin-bottom:14px;">
          Hãy chuyển sang làm câu hỏi trắc nghiệm để kiểm chứng mức độ hiểu bản chất. Mỗi câu đều có giải thích chi tiết gắn với lý thuyết trên.
        </p>
        <button class="btn btn-primary btn-lg" id="startAllChapterQuizBtn">
          ✍️ Bắt đầu làm toàn bộ ${questions.length} câu trắc nghiệm Chương ${ch.chapter} →
        </button>
      </div>
    `;
  }

  function bindTheoryTabEvents(ch) {
    mainContent.querySelectorAll('[data-toggle-read]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.getAttribute('data-toggle-read');
        userState.readTopics[tid] = !userState.readTopics[tid];
        saveState();
        renderChapterView(ch);
      });
    });

    mainContent.querySelectorAll('[data-practice-topic]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.getAttribute('data-practice-topic');
        userState.readTopics[tid] = true;
        saveState();
        navigateTo('chapter', {
          chapter: ch.chapter,
          chapterTab: 'practice',
          practiceTopic: tid,
          practiceFilter: 'all',
          resetShuffle: true
        });
      });
    });

    const startAllBtn = document.getElementById('startAllChapterQuizBtn');
    if (startAllBtn) {
      startAllBtn.addEventListener('click', () => {
        (ch.topics || []).forEach((t) => {
          userState.readTopics[t.id] = true;
        });
        saveState();
        navigateTo('chapter', {
          chapter: ch.chapter,
          chapterTab: 'practice',
          practiceTopic: 'all',
          practiceFilter: 'all',
          resetShuffle: true
        });
      });
    }
  }

  // Get filtered questions for current chapter practice
  function getFilteredChapterQuestions(ch) {
    let list = (ch.questions || []).slice();
    if (uiState.practiceTopic !== 'all') {
      list = list.filter((q) => q.topic_id === uiState.practiceTopic);
    }
    if (uiState.practiceFilter === 'unanswered') {
      list = list.filter((q) => !userState.answers[q.id]);
    } else if (uiState.practiceFilter === 'wrong') {
      list = list.filter((q) => userState.answers[q.id] && userState.answers[q.id] !== q.answer);
    } else if (uiState.practiceFilter === 'everWrong') {
      list = list.filter((q) => userState.everWrong && userState.everWrong[q.id] && userState.everWrong[q.id].wrongCount > 0);
    } else if (uiState.practiceFilter === 'bookmarked') {
      list = list.filter((q) => userState.bookmarks[q.id]);
    }
    if (uiState.shuffledIds) {
      const orderMap = {};
      uiState.shuffledIds.forEach((id, idx) => { orderMap[id] = idx; });
      list.sort((a, b) => (orderMap[a.id] ?? 9999) - (orderMap[b.id] ?? 9999));
    }
    return list;
  }

  function renderChapterPracticeTab(ch) {
    const topics = ch.topics || [];
    const chQuestions = ch.questions || [];
    const filtered = getFilteredChapterQuestions(ch);
    if (uiState.singleIndex >= filtered.length) {
      uiState.singleIndex = Math.max(0, filtered.length - 1);
    }

    const chEverWrong = chQuestions.filter((q) => userState.everWrong && userState.everWrong[q.id] && userState.everWrong[q.id].wrongCount > 0);
    const chActiveWrong = chQuestions.filter((q) => userState.answers[q.id] && userState.answers[q.id] !== q.answer);
    const chUnanswered = chQuestions.filter((q) => !userState.answers[q.id]);
    const chBookmarked = chQuestions.filter((q) => userState.bookmarks[q.id]);
    const chAnswered = chQuestions.filter((q) => userState.answers[q.id]);

    const topicOptionsHtml = `
      <option value="all" ${uiState.practiceTopic === 'all' ? 'selected' : ''}>Tất cả chủ đề (${chQuestions.length} câu)</option>
      ${topics.map((t) => {
        const count = chQuestions.filter((q) => q.topic_id === t.id).length;
        return `<option value="${t.id}" ${uiState.practiceTopic === t.id ? 'selected' : ''}>${escapeHtml(t.title)} (${count} câu)</option>`;
      }).join('')}
    `;

    let questionsContentHtml = '';
    if (filtered.length === 0) {
      questionsContentHtml = `
        <div class="card" style="text-align:center; padding:40px 20px;">
          <p style="font-size:15px; color:var(--text-secondary); margin-bottom:12px;">
            Không có câu hỏi nào khớp với bộ lọc hiện tại.
          </p>
          <button class="btn btn-sm" id="resetFilterBtn">Xem tất cả câu hỏi</button>
        </div>
      `;
    } else if (uiState.practiceMode === 'single') {
      const currentQ = filtered[uiState.singleIndex];
      questionsContentHtml = `
        <div id="singleQuestionContainer">
          ${renderQuestionCardHtml(currentQ, {
            indexLabel: `Câu ${uiState.singleIndex + 1}/${filtered.length} (Gốc: #${currentQ.number})`,
            showSingleNav: true,
            canPrev: uiState.singleIndex > 0,
            canNext: uiState.singleIndex < filtered.length - 1
          })}
        </div>
        <div class="question-palette">
          <div class="palette-title">Danh sách câu hỏi đang lọc (${filtered.length} câu) — Bấm số để chuyển nhanh:</div>
          <div class="palette-grid">
            ${filtered.map((q, idx) => {
              const uAns = userState.answers[q.id];
              const ew = userState.everWrong && userState.everWrong[q.id] && userState.everWrong[q.id].wrongCount > 0 ? userState.everWrong[q.id] : null;
              let cls = '';
              let title = `Câu ${q.number}`;
              if (uAns) {
                if (uAns === q.answer) {
                  if (ew) {
                    cls = 'done-ever-wrong';
                    title += ` (Đã làm đúng sau khi từng chọn sai ${ew.wrongCount} lần: ${ew.wrongChoices.join(', ')})`;
                  } else {
                    cls = 'done-correct';
                    title += ' (Đúng ngay lần đầu)';
                  }
                } else {
                  cls = 'done-wrong';
                  title += ` (Đang chọn sai: ${uAns})`;
                }
              } else if (ew) {
                cls = 'done-ever-wrong';
                title += ` (Chưa chọn lại, từng làm sai: ${ew.wrongChoices.join(', ')})`;
              }
              if (idx === uiState.singleIndex) cls += ' current';
              return `<button class="palette-dot ${cls}" data-jump-idx="${idx}" title="${escapeHtml(title)}">${q.number}</button>`;
            }).join('')}
          </div>
          <div class="palette-legend">
            <span class="legend-item"><span class="legend-dot" style="background:#10b981;"></span> Đúng ngay lần đầu</span>
            <span class="legend-item"><span class="legend-dot" style="background:#f59e0b;"></span> Từng làm sai</span>
            <span class="legend-item"><span class="legend-dot" style="background:#ef4444;"></span> Đang chọn sai</span>
            <span class="legend-item"><span class="legend-dot" style="background:var(--bg-card); border:1px solid var(--border-medium);"></span> Chưa làm</span>
          </div>
        </div>
      `;
    } else {
      questionsContentHtml = `
        <div id="listQuestionsContainer">
          ${filtered.map((q) => renderQuestionCardHtml(q, {
            indexLabel: `Câu ${q.number}`
          })).join('')}
        </div>
      `;
    }

    const reviewBannerHtml = `
      <div class="chapter-review-wrapper">
        ${chEverWrong.length > 0 ? `
          <div class="chapter-review-banner">
            <div class="chapter-review-info">
              <div class="chapter-review-title">
                <span>⚠️ Tổng kết Chương ${ch.chapter}: Có ${chEverWrong.length} câu bạn từng làm sai</span>
              </div>
              <div class="chapter-review-desc">
                Trong quá trình làm trắc nghiệm Chương ${ch.chapter}, bạn đã từng chọn nhầm <strong>${chEverWrong.length}</strong> câu hỏi. Dù bạn đã chọn lại đáp án đúng, hệ thống vẫn lưu lại để giúp bạn tự kiểm tra lại phản xạ trước khi sang chương mới!
              </div>
            </div>
            <div class="chapter-review-actions">
              <button class="btn btn-sm" id="filterEverWrongBtn">
                🔍 Lọc xem ${chEverWrong.length} câu từng sai
              </button>
              <button class="btn btn-sm" id="resetEverWrongForRetestBtn" style="background:#d97706; color:#fff; border-color:#b45309; font-weight:700;">
                ↺ Xóa đáp án để tự thi lại ${chEverWrong.length} câu này
              </button>
            </div>
          </div>
        ` : (chAnswered.length === chQuestions.length && chQuestions.length > 0 ? `
          <div class="chapter-review-banner all-clean">
            <div class="chapter-review-info">
              <div class="chapter-review-title">
                🎉 Xuất sắc! Bạn đã làm đúng toàn bộ ${chQuestions.length} câu Chương ${ch.chapter} mà không bị sai câu nào!
              </div>
              <div class="chapter-review-desc">
                Kiến thức Chương ${ch.chapter} đã được củng cố rất vững chắc. Bạn có thể tự tin chuyển sang chương tiếp theo hoặc làm đề thi thử tổng hợp!
              </div>
            </div>
          </div>
        ` : '')}
      </div>
    `;

    return `
      <div class="practice-toolbar">
        <div class="toolbar-group">
          <select class="toolbar-select" id="practiceTopicSelect" aria-label="Chọn chủ đề lý thuyết">
            ${topicOptionsHtml}
          </select>
          ${uiState.practiceTopic !== 'all' ? `
            <button class="btn btn-sm" data-open-topic-modal="${uiState.practiceTopic}">
              📖 Xem lý thuyết chủ đề này
            </button>
          ` : ''}
        </div>

        <div class="toolbar-group">
          <div class="filter-pills">
            <button class="filter-pill ${uiState.practiceFilter === 'all' ? 'active' : ''}" data-filter="all">Tất cả (${chQuestions.length})</button>
            <button class="filter-pill ${uiState.practiceFilter === 'unanswered' ? 'active' : ''}" data-filter="unanswered">Chưa làm (${chUnanswered.length})</button>
            <button class="filter-pill ${uiState.practiceFilter === 'everWrong' ? 'active' : ''}" data-filter="everWrong" style="${chEverWrong.length > 0 ? 'font-weight:700; color:#b45309;' : ''}">
              ⚠️ Từng làm sai (${chEverWrong.length})
            </button>
            ${chActiveWrong.length > 0 ? `
              <button class="filter-pill ${uiState.practiceFilter === 'wrong' ? 'active' : ''}" data-filter="wrong">Đang sai (${chActiveWrong.length})</button>
            ` : ''}
            <button class="filter-pill ${uiState.practiceFilter === 'bookmarked' ? 'active' : ''}" data-filter="bookmarked">★ Đã lưu (${chBookmarked.length})</button>
          </div>

          <div class="filter-pills">
            <button class="filter-pill ${uiState.practiceMode === 'list' ? 'active' : ''}" data-mode="list" title="Hiển thị danh sách">Danh sách</button>
            <button class="filter-pill ${uiState.practiceMode === 'single' ? 'active' : ''}" data-mode="single" title="Hiển thị từng câu">Từng câu</button>
          </div>

          <button class="btn btn-sm" id="shuffleQuestionsBtn" title="Trộn ngẫu nhiên thứ tự câu hỏi">🔀 Trộn</button>
          <button class="btn btn-sm" id="resetFilteredAnswersBtn" title="Xóa đáp án đã chọn của các câu đang lọc để làm lại">↺ Làm lại</button>
        </div>
      </div>

      ${questionsContentHtml}

      ${reviewBannerHtml}
    `;
  }

  function renderQuestionCardHtml(q, opts = {}) {
    const userAns = userState.answers[q.id];
    const isAnswered = !!userAns;
    const isCorrect = isAnswered && userAns === q.answer;
    const isBookmarked = !!userState.bookmarks[q.id];
    const ew = userState.everWrong && userState.everWrong[q.id] && userState.everWrong[q.id].wrongCount > 0 ? userState.everWrong[q.id] : null;
    const topicObj = topicMap[q.topic_id];
    const topicLabel = q.topic_name || (topicObj ? topicObj.title : `Chương ${q.chapter}`);

    return `
      <div class="question-card" id="qcard-${q.id}" data-qid="${q.id}">
        <div class="question-meta-bar">
          <div class="question-badges">
            <span class="q-num-badge">${escapeHtml(opts.indexLabel || `Câu ${q.number}`)}</span>
            ${ew ? `
              <span class="q-ever-wrong-badge" title="Bạn đã từng chọn sai câu này: ${ew.wrongChoices.join(', ')}">
                ⚠️ Từng chọn sai (${ew.wrongCount} lần: ${ew.wrongChoices.join(', ')})
                <button class="clear-ew-mini-btn" data-clear-ever-wrong="${q.id}" title="Xóa đánh dấu từng sai khi bạn đã hoàn toàn hiểu chắc câu này">✕ Đã nhớ vững</button>
              </span>
            ` : ''}
            ${q.topic_id ? `
              <button class="q-topic-tag" data-open-topic-modal="${q.topic_id}" title="Xem sơ đồ & lý thuyết chủ đề này">
                ${ICONS.book}
                <span>${escapeHtml(topicLabel)}</span>
              </button>
            ` : ''}
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${isAnswered ? `
              <button class="btn btn-sm" data-retry-question="${q.id}" title="Làm lại câu này">
                ${ICONS.retry}
                <span>Làm lại</span>
              </button>
            ` : ''}
            <button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-bookmark-question="${q.id}">
              ${isBookmarked ? ICONS.starFilled : ICONS.star}
              <span>${isBookmarked ? 'Đã lưu' : 'Lưu câu'}</span>
            </button>
          </div>
        </div>

        <div class="question-text">${escapeHtml(q.question)}</div>

        <div class="options-list">
          ${['A', 'B', 'C', 'D'].map((letter) => {
            const optText = q.options[letter] || '';
            let stateClass = '';
            if (isAnswered) {
              if (letter === q.answer) {
                stateClass = 'correct';
              } else if (letter === userAns && userAns !== q.answer) {
                stateClass = 'wrong';
              }
            }
            return `
              <button class="option-btn ${stateClass}" data-select-opt="${letter}" data-qid="${q.id}">
                <span class="option-letter">${letter}</span>
                <span class="option-content">${escapeHtml(optText)}</span>
              </button>
            `;
          }).join('')}
        </div>

        ${isAnswered ? `
          <div class="explanation-box ${isCorrect ? 'is-correct' : 'is-wrong'}">
            <div class="explanation-banner">
              <span class="explanation-status-pill ${isCorrect ? 'is-correct' : 'is-wrong'}">
                ${isCorrect ? ICONS.check : ICONS.cross}
                <span>${isCorrect ? `Chính xác • Đáp án ${q.answer}` : `Chưa đúng (Bạn chọn ${userAns} — Đáp án đúng là ${q.answer})`}</span>
              </span>
              ${q.topic_id ? `
                <button class="btn btn-sm" data-open-topic-modal="${q.topic_id}">
                  ${ICONS.book}
                  <span>Đối chiếu lý thuyết & Sơ đồ</span>
                </button>
              ` : ''}
            </div>
            ${(isCorrect && ew) ? `
              <div style="margin: 10px 0 6px 0; padding: 8px 12px; background: #fffbeb; border: 1px dashed #fde68a; border-radius: 6px; font-size: 13px; color: #92400e; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <span>⚠️ <strong>Lưu ý bẫy đề thi:</strong> Bạn đã từng chọn nhầm <strong>${ew.wrongChoices.join(', ')}</strong> (${ew.wrongCount} lần). Hãy ghi nhớ bản chất dưới đây để không bị lừa khi vào phòng thi!</span>
              </div>
            ` : ''}
            <div class="explanation-body">
              <div class="explanation-headline">
                ${ICONS.bulb}
                <span>Phân tích bản chất (Giáo trình HUB):</span>
              </div>
              <div class="explanation-text">
                ${escapeHtml(q.explanation || 'Đáp án đúng theo chuẩn giáo trình Quản trị nguồn nhân lực.')}
              </div>
            </div>
          </div>
        ` : ''}

        ${opts.showSingleNav ? `
          <div class="single-nav-bar">
            <button class="btn btn-sm" id="prevSingleBtn" ${!opts.canPrev ? 'disabled' : ''}>← Câu trước</button>
            <span class="keyboard-hint">Phím tắt: <strong>A/B/C/D</strong> hoặc <strong>1-4</strong> chọn đáp án • <strong>← / →</strong> chuyển câu</span>
            <button class="btn btn-primary btn-sm" id="nextSingleBtn" ${!opts.canNext ? 'disabled' : ''}>Câu tiếp theo →</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function bindPracticeTabEvents(ch) {
    const topicSelect = document.getElementById('practiceTopicSelect');
    if (topicSelect) {
      topicSelect.addEventListener('change', () => {
        uiState.practiceTopic = topicSelect.value;
        uiState.singleIndex = 0;
        renderChapterView(ch);
      });
    }

    mainContent.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.practiceFilter = btn.getAttribute('data-filter');
        uiState.singleIndex = 0;
        renderChapterView(ch);
      });
    });

    mainContent.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.practiceMode = btn.getAttribute('data-mode');
        renderChapterView(ch);
      });
    });

    const resetFilterBtn = document.getElementById('resetFilterBtn');
    if (resetFilterBtn) {
      resetFilterBtn.addEventListener('click', () => {
        uiState.practiceTopic = 'all';
        uiState.practiceFilter = 'all';
        renderChapterView(ch);
      });
    }

    const shuffleBtn = document.getElementById('shuffleQuestionsBtn');
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => {
        const list = (ch.questions || []).map((q) => q.id);
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        uiState.shuffledIds = list;
        uiState.singleIndex = 0;
        renderChapterView(ch);
      });
    }

    const resetFilteredBtn = document.getElementById('resetFilteredAnswersBtn');
    if (resetFilteredBtn) {
      resetFilteredBtn.addEventListener('click', () => {
        const filtered = getFilteredChapterQuestions(ch);
        if (!filtered.length) return;
        filtered.forEach((q) => {
          delete userState.answers[q.id];
          delete userState.mistakes[q.id];
        });
        saveState();
        renderChapterView(ch);
      });
    }

    // Filter to questions ever answered wrong
    const filterEverWrongBtn = document.getElementById('filterEverWrongBtn');
    if (filterEverWrongBtn) {
      filterEverWrongBtn.addEventListener('click', () => {
        uiState.practiceFilter = 'everWrong';
        uiState.singleIndex = 0;
        renderChapterView(ch);
        const topEl = document.querySelector('.practice-toolbar');
        if (topEl) topEl.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Reset answers for everWrong questions to do Retest mode
    const resetEverWrongBtn = document.getElementById('resetEverWrongForRetestBtn');
    if (resetEverWrongBtn) {
      resetEverWrongBtn.addEventListener('click', () => {
        const chQuestions = ch.questions || [];
        const chEverWrong = chQuestions.filter((q) => userState.everWrong && userState.everWrong[q.id] && userState.everWrong[q.id].wrongCount > 0);
        if (chEverWrong.length === 0) return;
        if (confirm(`Bạn muốn xóa đáp án của ${chEverWrong.length} câu từng làm sai trong Chương ${ch.chapter} để tự kiểm tra lại phản xạ không?`)) {
          chEverWrong.forEach((q) => {
            delete userState.answers[q.id];
            delete userState.mistakes[q.id];
          });
          saveState();
          uiState.practiceFilter = 'everWrong';
          uiState.singleIndex = 0;
          renderChapterView(ch);
          const topEl = document.querySelector('.practice-toolbar');
          if (topEl) topEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    const prevBtn = document.getElementById('prevSingleBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (uiState.singleIndex > 0) {
          uiState.singleIndex--;
          renderChapterView(ch);
        }
      });
    }

    const nextBtn = document.getElementById('nextSingleBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const filtered = getFilteredChapterQuestions(ch);
        if (uiState.singleIndex < filtered.length - 1) {
          uiState.singleIndex++;
          renderChapterView(ch);
        }
      });
    }

    mainContent.querySelectorAll('[data-jump-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.singleIndex = parseInt(btn.getAttribute('data-jump-idx'), 10);
        renderChapterView(ch);
      });
    });

    bindQuestionCardDelegation(mainContent, () => renderChapterView(ch));
  }

  // Shared Question Card Interactions (Selecting option, Bookmark, Retry, Open Theory Modal)
  function bindQuestionCardDelegation(container, onReRender) {
    container.querySelectorAll('[data-select-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-qid');
        const letter = btn.getAttribute('data-select-opt');
        const q = questionMap[qId];
        if (!q) return;

        recordUserAnswer(qId, letter);

        // Update just this card in place if in list mode to avoid scroll jump
        const cardEl = document.getElementById(`qcard-${qId}`);
        if (cardEl && uiState.practiceMode === 'list' && uiState.view === 'chapter') {
          const tmp = document.createElement('div');
          tmp.innerHTML = renderQuestionCardHtml(q, { indexLabel: `Câu ${q.number}` });
          const newCard = tmp.firstElementChild;
          cardEl.replaceWith(newCard);
          bindQuestionCardDelegation(newCard.parentElement, onReRender);
          updateSidebarStats();
        } else {
          onReRender();
        }
      });
    });

    container.querySelectorAll('[data-retry-question]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-retry-question');
        delete userState.answers[qId];
        delete userState.mistakes[qId];
        saveState();
        onReRender();
      });
    });

    container.querySelectorAll('[data-clear-ever-wrong]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const qId = btn.getAttribute('data-clear-ever-wrong');
        if (userState.everWrong && userState.everWrong[qId]) {
          delete userState.everWrong[qId];
          saveState();
          onReRender();
        }
      });
    });

    container.querySelectorAll('[data-bookmark-question]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-bookmark-question');
        if (userState.bookmarks[qId]) {
          delete userState.bookmarks[qId];
        } else {
          userState.bookmarks[qId] = true;
        }
        saveState();
        onReRender();
      });
    });

    container.querySelectorAll('[data-open-topic-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.getAttribute('data-open-topic-modal');
        openTheoryModal(tid);
      });
    });
  }

  // 3. MISTAKES & BOOKMARKS COLLECTION VIEW
  function renderCollectionView(type) {
    const isMistakes = type === 'mistakes';
    let qIds = [];

    if (isMistakes) {
      const ewMap = userState.everWrong || {};
      const activeMap = userState.mistakes || {};
      const idSet = new Set([
        ...Object.keys(ewMap).filter((id) => ewMap[id] && ewMap[id].wrongCount > 0),
        ...Object.keys(activeMap).filter((id) => activeMap[id])
      ]);
      qIds = Array.from(idSet).filter((id) => questionMap[id]);
    } else {
      qIds = Object.keys(userState.bookmarks || {}).filter((id) => userState.bookmarks[id] && questionMap[id]);
    }

    let allList = qIds.map((id) => questionMap[id]);

    // Sorting by chapter and question number
    allList.sort((a, b) => {
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.number - b.number;
    });

    const activeChapFilter = uiState.collectionChapterFilter || 'all';
    let displayList = allList;
    if (activeChapFilter !== 'all') {
      displayList = allList.filter((q) => q.chapter === parseInt(activeChapFilter, 10));
    }

    // Build chapter breakdown counts
    const byChapCount = {};
    allList.forEach((q) => {
      byChapCount[q.chapter] = (byChapCount[q.chapter] || 0) + 1;
    });

    mainContent.innerHTML = `
      <div class="page-header">
        <span class="page-eyebrow">${isMistakes ? 'Ôn tập lỗ hổng kiến thức & Lịch sử câu sai' : 'Danh sách lưu trữ'}</span>
        <h2 class="page-title">${isMistakes ? '⚠️ Các Câu Từng Làm Sai Cần Ôn Lại' : '★ Các Câu Hỏi Đã Đánh Dấu'} (${allList.length})</h2>
        <p class="page-desc">
          ${isMistakes
            ? 'Khi bạn chọn nhầm bất kỳ đáp án nào, câu hỏi đó sẽ được tự động lưu lại vào đây kèm theo lịch sử các lần chọn sai. Dù bạn đã chọn lại đáp án đúng, hệ thống vẫn lưu vết tại đây để giúp bạn tự kiểm tra lại phản xạ bất cứ lúc nào.'
            : 'Những câu hỏi trọng tâm hoặc dễ nhầm lẫn bạn đã gắn dấu sao trong quá trình học.'}
        </p>
      </div>

      ${allList.length === 0 ? `
        <div class="card" style="text-align:center; padding:40px 24px;">
          <p style="font-size:15.5px; color:var(--text-secondary); margin-bottom:14px;">
            ${isMistakes
              ? '🎉 Tuyệt vời! Bạn chưa từng làm sai câu nào hoặc đã hoàn thành ôn tập toàn bộ các câu sai!'
              : 'Bạn chưa đánh dấu câu hỏi nào. Hãy bấm nút "☆ Lưu câu" ở bất kỳ câu nào bạn muốn ghi nhớ đặc biệt.'}
          </p>
          <button class="btn btn-primary" id="backToOverviewBtn">Quay về Tổng quan môn học</button>
        </div>
      ` : `
        <div class="card" style="margin-bottom:20px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <label style="font-size:13.5px; font-weight:600; color:var(--text-secondary);">Lọc theo chương:</label>
            <select class="toolbar-select" id="collectionChapterFilter">
              <option value="all" ${activeChapFilter === 'all' ? 'selected' : ''}>Tất cả các chương (${allList.length} câu)</option>
              ${chapters.map((ch) => {
                const count = byChapCount[ch.chapter] || 0;
                return `<option value="${ch.chapter}" ${activeChapFilter === String(ch.chapter) ? 'selected' : ''}>Chương ${ch.chapter}: ${escapeHtml(ch.title)} (${count} câu)</option>`;
              }).join('')}
            </select>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn btn-sm" id="retestCollectionBtn" style="background:#d97706; color:#fff; border-color:#b45309; font-weight:600;" title="Xóa đáp án đã chọn để bạn tự làm lại các câu đang hiển thị">
              ↺ Tự kiểm tra lại ${displayList.length} câu này (Xóa đáp án)
            </button>
            ${isMistakes ? `
              <button class="btn btn-sm" id="clearAllMistakesHistoryBtn" title="Xóa toàn bộ lịch sử sai để đặt lại từ đầu">
                🗑️ Xóa danh sách từng sai
              </button>
            ` : ''}
          </div>
        </div>

        <div id="collectionQuestionsContainer">
          ${displayList.map((q) => renderQuestionCardHtml(q, {
            indexLabel: `Chương ${q.chapter} • Câu ${q.number}`
          })).join('')}
        </div>
      `}
    `;

    const backBtn = document.getElementById('backToOverviewBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => navigateTo('overview'));
    }

    const chapFilterSelect = document.getElementById('collectionChapterFilter');
    if (chapFilterSelect) {
      chapFilterSelect.addEventListener('change', () => {
        uiState.collectionChapterFilter = chapFilterSelect.value;
        renderCollectionView(type);
      });
    }

    const retestBtn = document.getElementById('retestCollectionBtn');
    if (retestBtn) {
      retestBtn.addEventListener('click', () => {
        if (!displayList.length) return;
        if (confirm(`Bạn có muốn xóa đáp án của ${displayList.length} câu này để tự kiểm tra lại phản xạ không? (Lịch sử câu sai vẫn được giữ nguyên)`)) {
          displayList.forEach((q) => {
            delete userState.answers[q.id];
            delete userState.mistakes[q.id];
          });
          saveState();
          renderCollectionView(type);
        }
      });
    }

    const clearAllBtn = document.getElementById('clearAllMistakesHistoryBtn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        if (confirm('Bạn có chắc muốn xóa lịch sử "Từng làm sai" của tất cả các câu này không? Hành động này sẽ làm sạch danh sách từng sai.')) {
          displayList.forEach((q) => {
            if (userState.everWrong) delete userState.everWrong[q.id];
            delete userState.mistakes[q.id];
          });
          saveState();
          renderCollectionView(type);
        }
      });
    }

    const container = document.getElementById('collectionQuestionsContainer');
    if (container) {
      bindQuestionCardDelegation(container, () => renderCollectionView(type));
    }
  }

  // 4. EXAM SIMULATOR VIEW
  function renderExamView() {
    if (!uiState.examActive) {
      renderExamSetup();
    } else {
      renderActiveExam();
    }
  }

  function renderExamSetup() {
    const cfg = uiState.examConfig;
    mainContent.innerHTML = `
      <div class="page-header">
        <span class="page-eyebrow">Kiểm tra năng lực</span>
        <h2 class="page-title">📝 Thi Thử Trắc Nghiệm Cuối Kỳ</h2>
        <p class="page-desc">
          Hệ thống sẽ rút ngẫu nhiên các câu hỏi từ các chương bạn chọn. Sau khi nộp bài, hệ thống sẽ chấm điểm thang 10 và chỉ ra chương nào bạn nắm vững, chương nào cần đọc lại lý thuyết.
        </p>
      </div>

      <div class="card">
        <div class="card-title">Cấu hình đề thi thử</div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:20px;">
          <div>
            <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">Số lượng câu hỏi:</label>
            <select class="toolbar-select" id="examCountSelect" style="width:100%;">
              <option value="20" ${cfg.count === 20 ? 'selected' : ''}>20 câu (Kiểm tra nhanh)</option>
              <option value="40" ${cfg.count === 40 ? 'selected' : ''}>40 câu (Chuẩn thi cuối kỳ)</option>
              <option value="60" ${cfg.count === 60 ? 'selected' : ''}>60 câu (Đề tổng hợp nâng cao)</option>
              <option value="80" ${cfg.count === 80 ? 'selected' : ''}>80 câu (Luyện toàn diện)</option>
            </select>
          </div>
          <div>
            <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">Thời gian làm bài:</label>
            <select class="toolbar-select" id="examMinutesSelect" style="width:100%;">
              <option value="20" ${cfg.minutes === 20 ? 'selected' : ''}>20 phút</option>
              <option value="45" ${cfg.minutes === 45 ? 'selected' : ''}>45 phút</option>
              <option value="60" ${cfg.minutes === 60 ? 'selected' : ''}>60 phút</option>
              <option value="0" ${cfg.minutes === 0 ? 'selected' : ''}>Không giới hạn thời gian</option>
            </select>
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label style="font-size:13px; font-weight:600;">Chọn các chương trong phạm vi đề thi:</label>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-sm" id="selectAllChapsExamBtn">Chọn tất cả</button>
              <button class="btn btn-sm" id="deselectAllChapsExamBtn">Bỏ chọn</button>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:8px;">
            ${chapters.map((ch) => {
              const checked = cfg.selectedChapters.includes(ch.chapter);
              return `
                <label style="display:flex; align-items:center; gap:8px; padding:10px 12px; border:1px solid var(--border-color); border-radius:var(--radius-sm); cursor:pointer; background:var(--bg-page); font-size:13.5px;">
                  <input type="checkbox" class="exam-chap-checkbox" value="${ch.chapter}" ${checked ? 'checked' : ''} />
                  <span><strong>Chương ${ch.chapter}:</strong> ${escapeHtml(ch.title)} (${ch.questions.length} câu)</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <button class="btn btn-primary btn-lg" id="startExamNowBtn">🚀 Bắt đầu làm bài thi thử</button>
      </div>
    `;

    document.getElementById('selectAllChapsExamBtn').addEventListener('click', () => {
      uiState.examConfig.selectedChapters = chapters.map((c) => c.chapter);
      renderExamSetup();
    });
    document.getElementById('deselectAllChapsExamBtn').addEventListener('click', () => {
      uiState.examConfig.selectedChapters = [];
      renderExamSetup();
    });

    document.getElementById('startExamNowBtn').addEventListener('click', () => {
      const count = parseInt(document.getElementById('examCountSelect').value, 10);
      const minutes = parseInt(document.getElementById('examMinutesSelect').value, 10);
      const selected = [];
      mainContent.querySelectorAll('.exam-chap-checkbox:checked').forEach((cb) => {
        selected.push(parseInt(cb.value, 10));
      });
      if (selected.length === 0) {
        alert('Vui lòng chọn ít nhất 1 chương để tạo đề thi!');
        return;
      }
      uiState.examConfig = { count, minutes, selectedChapters: selected };
      startNewExam();
    });
  }

  function startNewExam() {
    const pool = [];
    uiState.examConfig.selectedChapters.forEach((cnum) => {
      const ch = chapterMap[cnum];
      if (ch && ch.questions) {
        ch.questions.forEach((q) => {
          pool.push(questionMap[q.id]);
        });
      }
    });
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const chosen = pool.slice(0, Math.min(uiState.examConfig.count, pool.length));

    uiState.examActive = true;
    uiState.examSubmitted = false;
    uiState.examQuestions = chosen;
    uiState.examAnswers = {};
    uiState.examTimeLeft = uiState.examConfig.minutes * 60;

    if (uiState.examTimerId) clearInterval(uiState.examTimerId);
    if (uiState.examConfig.minutes > 0) {
      uiState.examTimerId = setInterval(() => {
        if (uiState.examTimeLeft > 0) {
          uiState.examTimeLeft--;
          const timerEl = document.getElementById('examTimerDisplay');
          if (timerEl) {
            timerEl.textContent = formatTime(uiState.examTimeLeft);
          }
        } else {
          submitExam();
        }
      }, 1000);
    }

    renderActiveExam();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function submitExam() {
    if (uiState.examTimerId) {
      clearInterval(uiState.examTimerId);
      uiState.examTimerId = null;
    }
    uiState.examSubmitted = true;

    // Also record answers into global userState so mistakes are tracked
    uiState.examQuestions.forEach((q) => {
      const ans = uiState.examAnswers[q.id];
      if (ans) {
        recordUserAnswer(q.id, ans);
      } else {
        userState.mistakes[q.id] = true;
        if (!userState.everWrong) userState.everWrong = {};
        if (!userState.everWrong[q.id]) {
          userState.everWrong[q.id] = {
            wrongCount: 0,
            wrongChoices: [],
            lastWrongChoice: '(Chưa chọn)',
            firstWrongAt: Date.now()
          };
        }
        userState.everWrong[q.id].wrongCount = (userState.everWrong[q.id].wrongCount || 0) + 1;
        if (!userState.everWrong[q.id].wrongChoices.includes('(Chưa chọn)')) {
          userState.everWrong[q.id].wrongChoices.push('(Chưa chọn)');
        }
      }
    });
    saveState();
    renderActiveExam();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderActiveExam() {
    const qs = uiState.examQuestions;
    const answeredCount = Object.keys(uiState.examAnswers).length;
    const isSubmitted = uiState.examSubmitted;

    let scoreCardHtml = '';
    if (isSubmitted) {
      let correct = 0;
      const byChapter = {};
      qs.forEach((q) => {
        if (!byChapter[q.chapter]) {
          byChapter[q.chapter] = { total: 0, correct: 0, title: q.chapterTitle };
        }
        byChapter[q.chapter].total++;
        if (uiState.examAnswers[q.id] === q.answer) {
          correct++;
          byChapter[q.chapter].correct++;
        }
      });
      const score10 = qs.length > 0 ? ((correct / qs.length) * 10).toFixed(2) : '0.00';

      scoreCardHtml = `
        <div class="card" style="border-left: 4px solid var(--primary); background: var(--bg-surface);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:16px;">
            <div>
              <div style="font-size:13px; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Kết quả bài thi thử</div>
              <div style="font-size:28px; font-weight:700; color:var(--primary);">Điểm số: ${score10} / 10</div>
              <div style="font-size:14px; color:var(--text-secondary);">Đúng <strong>${correct} / ${qs.length}</strong> câu (${Math.round((correct / qs.length) * 100)}%)</div>
            </div>
            <div style="display:flex; gap:10px;">
              <button class="btn btn-primary" id="newExamBtn">Tạo đề thi mới</button>
            </div>
          </div>

          <div style="font-size:13.5px; font-weight:600; margin-bottom:8px;">Phân tích mức độ hiểu bài theo từng chương:</div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:8px;">
            ${Object.keys(byChapter).map((cnum) => {
              const st = byChapter[cnum];
              const pct = Math.round((st.correct / st.total) * 100);
              return `
                <div style="padding:10px 12px; border:1px solid var(--border-color); border-radius:var(--radius-sm); background:var(--bg-page); font-size:13px;">
                  <div style="font-weight:600;">Chương ${cnum}: ${escapeHtml(st.title)}</div>
                  <div style="color:${pct >= 70 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
                    Đúng ${st.correct}/${st.total} câu (${pct}%)
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    mainContent.innerHTML = `
      ${!isSubmitted ? `
        <div class="exam-top-bar">
          <div>
            <strong>Đề thi thử (${qs.length} câu)</strong> • Đã chọn: <span id="examAnsweredCounter">${answeredCount}/${qs.length}</span>
          </div>
          <div class="exam-timer" id="examTimerDisplay">
            ${uiState.examConfig.minutes > 0 ? formatTime(uiState.examTimeLeft) : '∞'}
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-sm" id="cancelExamBtn">Hủy</button>
            <button class="btn btn-primary btn-sm" id="submitExamBtn">Nộp bài & Chấm điểm</button>
          </div>
        </div>
      ` : scoreCardHtml}

      <div id="examQuestionsList">
        ${qs.map((q, idx) => {
          const uAns = uiState.examAnswers[q.id];
          const isCorrect = uAns === q.answer;
          return `
            <div class="question-card" id="exam-q-${idx}">
              <div class="question-meta-bar">
                <div class="question-badges">
                  <span class="q-num-badge">Câu ${idx + 1} / ${qs.length}</span>
                  <span class="nav-badge">Chương ${q.chapter}</span>
                  ${isSubmitted && q.topic_id ? `
                    <button class="q-topic-tag" data-open-topic-modal="${q.topic_id}">
                      📖 ${escapeHtml(q.topic_name || 'Xem lý thuyết')}
                    </button>
                  ` : ''}
                </div>
              </div>
              <div class="question-text">${escapeHtml(q.question)}</div>
              <div class="options-list">
                ${['A', 'B', 'C', 'D'].map((letter) => {
                  let cls = '';
                  if (!isSubmitted) {
                    if (uAns === letter) cls = 'selected-exam';
                  } else {
                    if (letter === q.answer) cls = 'correct';
                    else if (letter === uAns && uAns !== q.answer) cls = 'wrong';
                  }
                  return `
                    <button class="option-btn ${cls}" data-exam-qid="${q.id}" data-exam-opt="${letter}" ${isSubmitted ? 'disabled' : ''}>
                      <span class="option-letter">${letter}</span>
                      <span class="option-content">${escapeHtml(q.options[letter] || '')}</span>
                    </button>
                  `;
                }).join('')}
              </div>

              ${isSubmitted ? `
                <div class="explanation-box ${isCorrect ? 'is-correct' : 'is-wrong'}">
                  <div class="explanation-header">
                    <span class="explanation-status ${isCorrect ? 'correct-text' : 'wrong-text'}">
                      ${isCorrect
                        ? `✓ Chính xác! Đáp án đúng là ${q.answer}.`
                        : `✕ ${uAns ? `Bạn chọn ${uAns}` : 'Bạn bỏ trống'} — Đáp án đúng là ${q.answer}.`}
                    </span>
                    ${q.topic_id ? `
                      <button class="btn btn-sm" data-open-topic-modal="${q.topic_id}">📖 Xem lý thuyết</button>
                    ` : ''}
                  </div>
                  <div class="explanation-text">
                    <strong>💡 Giải thích bản chất:</strong> ${escapeHtml(q.explanation || '')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;

    if (!isSubmitted) {
      mainContent.querySelectorAll('[data-exam-opt]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const qId = btn.getAttribute('data-exam-qid');
          const opt = btn.getAttribute('data-exam-opt');
          uiState.examAnswers[qId] = opt;
          const parent = btn.closest('.options-list');
          parent.querySelectorAll('.option-btn').forEach((b) => {
            b.classList.toggle('selected-exam', b.getAttribute('data-exam-opt') === opt);
          });
          const counter = document.getElementById('examAnsweredCounter');
          if (counter) {
            counter.textContent = `${Object.keys(uiState.examAnswers).length}/${qs.length}`;
          }
        });
      });

      document.getElementById('submitExamBtn').addEventListener('click', () => {
        const remaining = qs.length - Object.keys(uiState.examAnswers).length;
        if (remaining > 0) {
          if (!confirm(`Bạn còn ${remaining} câu chưa chọn đáp án. Bạn có chắc muốn nộp bài ngay?`)) {
            return;
          }
        }
        submitExam();
      });

      document.getElementById('cancelExamBtn').addEventListener('click', () => {
        if (uiState.examTimerId) clearInterval(uiState.examTimerId);
        uiState.examActive = false;
        renderExamView();
      });
    } else {
      const newExamBtn = document.getElementById('newExamBtn');
      if (newExamBtn) {
        newExamBtn.addEventListener('click', () => {
          uiState.examActive = false;
          renderExamView();
        });
      }
      mainContent.querySelectorAll('[data-open-topic-modal]').forEach((btn) => {
        btn.addEventListener('click', () => {
          openTheoryModal(btn.getAttribute('data-open-topic-modal'));
        });
      });
    }
  }

  // 5. GLOBAL SEARCH VIEW
  function renderSearchView() {
    const qStr = (uiState.searchQuery || '').trim().toLowerCase();
    if (!qStr) {
      navigateTo('overview');
      return;
    }

    // Search topics
    const matchedTopics = [];
    Object.values(topicMap).forEach((t) => {
      const hay = `${t.title} ${t.summary || ''} ${t.content_html || ''}`.toLowerCase();
      if (hay.includes(qStr)) {
        matchedTopics.push(t);
      }
    });

    // Search questions
    const matchedQuestions = [];
    Object.values(questionMap).forEach((q) => {
      const hay = `${q.question} ${q.options.A} ${q.options.B} ${q.options.C} ${q.options.D} ${q.explanation || ''}`.toLowerCase();
      if (hay.includes(qStr)) {
        matchedQuestions.push(q);
      }
    });

    mainContent.innerHTML = `
      <div class="page-header">
        <span class="page-eyebrow">Tra cứu nhanh</span>
        <h2 class="page-title">Kết quả tìm kiếm cho "${escapeHtml(uiState.searchQuery)}"</h2>
        <p class="page-desc">
          Tìm thấy <strong>${matchedTopics.length} chủ đề lý thuyết</strong> và <strong>${matchedQuestions.length} câu hỏi trắc nghiệm</strong> có liên quan.
        </p>
      </div>

      ${matchedTopics.length > 0 ? `
        <div class="card">
          <div class="card-title">📖 Các Chủ đề Lý thuyết liên quan (${matchedTopics.length})</div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${matchedTopics.map((t) => `
              <div style="padding:12px 14px; border:1px solid var(--border-color); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; background:var(--bg-page);">
                <div>
                  <div style="font-size:12px; color:var(--primary); font-weight:600;">Chương ${t.chapter}: ${escapeHtml(t.chapterTitle)}</div>
                  <div style="font-weight:700; font-size:14.5px;">${escapeHtml(t.title)}</div>
                  <div style="font-size:13px; color:var(--text-secondary);">${escapeHtml(t.summary || '')}</div>
                </div>
                <button class="btn btn-sm btn-primary" data-open-topic-modal="${t.id}">Xem lý thuyết</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div id="searchQuestionsContainer">
        ${matchedQuestions.slice(0, 60).map((q) => renderQuestionCardHtml(q, {
          indexLabel: `Chương ${q.chapter} • Câu ${q.number}`
        })).join('')}
        ${matchedQuestions.length > 60 ? `
          <div class="card" style="text-align:center; color:var(--text-secondary);">
            Đang hiển thị 60 / ${matchedQuestions.length} câu hỏi khớp nhất. Hãy gõ từ khóa cụ thể hơn để thu hẹp kết quả.
          </div>
        ` : ''}
      </div>
    `;

    bindQuestionCardDelegation(mainContent, () => renderSearchView());
  }

  // Global Event Listeners
  function initEvents() {
    // Top-level nav buttons
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-view');
        navigateTo(v);
      });
    });

    // Chapter nav delegation
    chapterNavList.addEventListener('click', (e) => {
      const item = e.target.closest('[data-chapter]');
      if (!item) return;
      const cnum = parseInt(item.getAttribute('data-chapter'), 10);
      navigateTo('chapter', {
        chapter: cnum,
        chapterTab: 'theory',
        practiceTopic: 'all',
        practiceFilter: 'all',
        resetShuffle: true
      });
    });

    // Search input
    globalSearchInput.addEventListener('input', () => {
      const val = globalSearchInput.value;
      clearSearchBtn.classList.toggle('hidden', !val);
      uiState.searchQuery = val;
      if (val.trim().length > 0) {
        uiState.view = 'search';
        renderMain();
      } else {
        navigateTo('overview');
      }
    });

    clearSearchBtn.addEventListener('click', () => {
      globalSearchInput.value = '';
      clearSearchBtn.classList.add('hidden');
      uiState.searchQuery = '';
      navigateTo('overview');
    });

    // Reset all progress
    document.getElementById('resetAllBtn').addEventListener('click', () => {
      if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử làm bài và đặt lại tiến độ học từ đầu không?')) {
        userState = {
          answers: {},
          mistakes: {},
          everWrong: {},
          bookmarks: {},
          readTopics: {},
          examHistory: []
        };
        saveState();
        renderMain();
      }
    });

    // Export / Backup progress
    const exportBtn = document.getElementById('exportProgressBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userState, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", jsonStr);
        const dateStr = new Date().toISOString().slice(0, 10);
        dlAnchor.setAttribute("download", `tien_do_hoc_qtnnl_hub_${dateStr}.json`);
        document.body.appendChild(dlAnchor);
        dlAnchor.click();
        dlAnchor.remove();
      });
    }

    // Import / Restore progress
    const importBtn = document.getElementById('importProgressBtn');
    const importInput = document.getElementById('importFileInput');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => {
        importInput.click();
      });
      importInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = JSON.parse(evt.target.result);
            if (data && typeof data === 'object' && (data.answers || data.everWrong || data.bookmarks)) {
              userState = {
                answers: data.answers || {},
                mistakes: data.mistakes || {},
                everWrong: data.everWrong || {},
                bookmarks: data.bookmarks || {},
                readTopics: data.readTopics || {},
                examHistory: data.examHistory || []
              };
              saveState();
              renderMain();
              alert(`🎉 Khôi phục thành công! Đã nạp lại ${Object.keys(userState.answers).length} câu đã làm.`);
            } else {
              alert('File không hợp lệ hoặc không đúng định dạng sao lưu.');
            }
          } catch (err) {
            alert('Lỗi khi đọc file sao lưu: ' + err.message);
          }
          importInput.value = '';
        };
        reader.readAsText(file);
      });
    }

    // Mobile sidebar toggle
    document.getElementById('openSidebarBtn').addEventListener('click', () => {
      sidebar.classList.add('open');
    });
    document.getElementById('closeSidebarBtn').addEventListener('click', () => {
      sidebar.classList.remove('open');
    });

    // Modal close
    document.getElementById('closeTheoryModalBtn').addEventListener('click', closeTheoryModal);
    document.getElementById('closeTheoryModalFooterBtn').addEventListener('click', closeTheoryModal);
    theoryModalBackdrop.addEventListener('click', (e) => {
      if (e.target === theoryModalBackdrop) closeTheoryModal();
    });

    // Keyboard shortcuts for Single Question Mode
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }
      if (!theoryModalBackdrop.classList.contains('hidden')) {
        if (e.key === 'Escape') closeTheoryModal();
        return;
      }
      if (uiState.view === 'chapter' && uiState.chapterTab === 'practice' && uiState.practiceMode === 'single') {
        const ch = chapterMap[uiState.activeChapter];
        const filtered = getFilteredChapterQuestions(ch);
        if (!filtered.length) return;
        const currentQ = filtered[uiState.singleIndex];
        const keyMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D' };
        const letter = keyMap[e.key.toLowerCase()];
        if (letter && currentQ) {
          e.preventDefault();
          recordUserAnswer(currentQ.id, letter);
          renderChapterView(ch);
        } else if (e.key === 'ArrowRight' && uiState.singleIndex < filtered.length - 1) {
          e.preventDefault();
          uiState.singleIndex++;
          renderChapterView(ch);
        } else if (e.key === 'ArrowLeft' && uiState.singleIndex > 0) {
          e.preventDefault();
          uiState.singleIndex--;
          renderChapterView(ch);
        }
      }
    });
  }

  // Initialize
  updateSidebarStats();
  initEvents();
  renderMain();
})();
