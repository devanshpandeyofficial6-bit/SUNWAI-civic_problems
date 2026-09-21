const TRANSLATIONS = {
  en: {

    gov_india: 'Government of India',
    mohua: 'Ministry of Housing & Urban Affairs',
    helpline_label: 'Toll-Free Helpline:',
    portal_brand: 'SUNWAI',
    portal_sub: 'National Civic Grievance Redressal & Ward Management Portal · Govt. of India E-Governance',
    lang_label: 'Language:',

    nav_citizen_portal: 'Citizen Portal',
    nav_file_grievance: 'File Grievance',
    nav_track_status: 'Track Status',
    nav_issue_map: 'Issue Map',
    nav_ward_scores: 'Ward Scores',
    nav_official_login: 'Official Sign-In',

    nav_head_center: 'Municipal Command Center',
    nav_admin_center: 'Municipal Administration Console',
    nav_ward_console: 'Ward Console',
    nav_field_dispatch: 'Field Dispatch',
    sign_out: 'Sign Out',
    super_admin_badge: 'Super Admin',
    admin_badge: 'Administrator',
    ward_badge: 'Ward Officer',

    status_reported: 'Reported',
    status_acknowledged: 'Acknowledged',
    status_in_progress: 'In Progress',
    status_resolved: 'Resolved (Awaiting Verification)',
    status_closed: 'Closed (Citizen-Verified)',

    cat_all: 'All Categories',
    cat_pothole: 'Pothole',
    cat_streetlight: 'Broken Streetlight',
    cat_garbage: 'Garbage Pile-up',
    cat_water_leakage: 'Water Leakage',
    cat_broken_infrastructure: 'Damaged Infrastructure',
    cat_other: 'Other Civic Issue',

    time_just_now: 'just now',
    time_m_ago: 'm ago',
    time_h_ago: 'h ago',
    time_d_ago: 'd ago',

    ai_analyzing: 'Analyzing photo with YOLO AI...',
    ai_detected: 'Detected by AI',
    ai_confidence: 'AI Confidence',
    ai_low_confidence: 'Low Confidence (Please verify or change category)',
    ai_bbox_found: 'object(s) localized in photo',
    citizens_reported: 'Citizens Reported',
    single_citizen_reported: 'Citizen Reported',
    nearby_dup_alert: 'Matching Civic Issue Found in Neighborhood',
    merge_info: 'Submissions within 50m of the same category are aggregated into one high-priority civic issue.',
    btn_merge: 'Link to Existing Issue (Recommended)',
    btn_separate: 'Report as Separate Ticket',
    priority_high: 'High Priority',
    priority_medium: 'Medium Priority',
    priority_normal: 'Normal Priority',

    footer_desc: 'National civic grievance redressal, geospatial ward intelligence, and public accountability platform developed under Digital India and Ministry of Housing & Urban Affairs (MoHUA) e-governance guidelines.',
    footer_gigw: 'Guidelines for Indian Government Websites (GIGW) Compliant',
    footer_ssl: 'Secured with 256-bit SSL Encryption',
    footer_policies_title: 'Portal Policies',
    footer_policy_terms: 'Terms of Use',
    footer_policy_privacy: 'Privacy Policy',
    footer_policy_charter: "Citizens' Charter",
    footer_policy_hyperlink: 'Hyperlinking Policy',
    footer_help_title: 'Help & Support',
    footer_help_helpline: 'Toll-Free Helpline: 1916',
    footer_help_email: 'Support Email: support@sunwai.gov.in',
    footer_help_faqs: 'Frequently Asked Questions (FAQs)',
    footer_help_feedback: 'Citizen Feedback',
    footer_copyright: '© 2026 Government of India / Municipal Administration. All Rights Reserved.',
    footer_nic: 'Designed & Developed with DataMeet & Open Geospatial Standards',
  },
  hi: {

    gov_india: 'भारत सरकार',
    mohua: 'आवासन और शहरी कार्य मंत्रालय',
    helpline_label: 'टोल-फ्री हेल्पलाइन:',
    portal_brand: 'सुनवाई',
    portal_sub: 'राष्ट्रीय नागरिक शिकायत निवारण एवं वार्ड प्रबंधन पोर्टल · भारत सरकार ई-गवर्नेंस',
    lang_label: 'भाषा:',

    nav_citizen_portal: 'नागरिक पोर्टल',
    nav_file_grievance: 'शिकायत दर्ज करें',
    nav_track_status: 'स्थिति ट्रैक करें',
    nav_issue_map: 'समस्या मानचित्र',
    nav_ward_scores: 'वार्ड स्वास्थ्य',
    nav_official_login: 'अधिकारी लॉगिन',

    nav_head_center: 'नगर निगम प्रशासनिक नियंत्रण कक्ष',
    nav_admin_center: 'नगर निगम प्रशासनिक कंसोल',
    nav_ward_console: 'वार्ड नियंत्रण कक्ष',
    nav_field_dispatch: 'फील्ड कार्य प्रेषण',
    sign_out: 'लॉगआउट',
    super_admin_badge: 'सुपर एडमिन',
    admin_badge: 'प्रशासक',
    ward_badge: 'वार्ड अधिकारी',

    status_reported: 'दर्ज',
    status_acknowledged: 'स्वीकृत',
    status_in_progress: 'प्रगति पर',
    status_resolved: 'निस्तारित (सत्यापन प्रतीक्षित)',
    status_closed: 'बंद (नागरिक प्रमाणित)',

    cat_all: 'सभी श्रेणियां',
    cat_pothole: 'सड़क का गड्ढा',
    cat_streetlight: 'खराब स्ट्रीट लाइट',
    cat_garbage: 'कचरे का ढेर',
    cat_water_leakage: 'जल रिसाव / पाइप लीकेज',
    cat_broken_infrastructure: 'क्षतिग्रस्त बुनियादी ढांचा',
    cat_other: 'अन्य नागरिक समस्या',

    time_just_now: 'अभी-अभी',
    time_m_ago: 'मिनट पहले',
    time_h_ago: 'घंटे पहले',
    time_d_ago: 'दिन पहले',

    ai_analyzing: 'YOLO एआई द्वारा फोटो का विश्लेषण किया जा रहा है...',
    ai_detected: 'एआई द्वारा पहचाना गया',
    ai_confidence: 'एआई विश्वसनीयता',
    ai_low_confidence: 'कम विश्वसनीयता (कृपया श्रेणी की पुष्टि करें या बदलें)',
    ai_bbox_found: 'वस्तु(एं) फोटो में चिन्हित',
    citizens_reported: 'नागरिकों द्वारा दर्ज',
    single_citizen_reported: 'नागरिक द्वारा दर्ज',
    nearby_dup_alert: 'इस क्षेत्र में समान नागरिक समस्या पहले से दर्ज है',
    merge_info: '50 मीटर के दायरे में समान श्रेणी की शिकायतों को प्राथमिकता बढ़ाने हेतु एक मुख्य शिकायत में समेकित किया जाता है।',
    btn_merge: 'मौजूदा समस्या से जोड़ें (अनुशंसित)',
    btn_separate: 'अलग शिकायत के रूप में दर्ज करें',
    priority_high: 'उच्च प्राथमिकता',
    priority_medium: 'मध्यम प्राथमिकता',
    priority_normal: 'सामान्य प्राथमिकता',

    footer_desc: 'डिजिटल इंडिया एवं आवासन और शहरी कार्य मंत्रालय (MoHUA) की ई-गवर्नेंस पहल के अंतर्गत विकसित राष्ट्रीय नागरिक शिकायत निवारण, भू-स्थानिक वार्ड विश्लेषण एवं जवाबदेही प्रणाली।',
    footer_gigw: 'भारतीय सरकारी वेबसाइट दिशानिर्देश (GIGW) अनुपालन',
    footer_ssl: '256-बिट एसएसएल एन्क्रिप्शन द्वारा सुरक्षित',
    footer_policies_title: 'पोर्टल नीतियां',
    footer_policy_terms: 'नियम एवं शर्तें',
    footer_policy_privacy: 'गोपनीयता नीति',
    footer_policy_charter: 'नागरिक अधिकार पत्र',
    footer_policy_hyperlink: 'हाइपरलिंकिंग नीति',
    footer_help_title: 'सहायता एवं संपर्क',
    footer_help_helpline: 'टोल-फ्री हेल्पलाइन: 1916',
    footer_help_email: 'ईमेल सहायता: support@sunwai.gov.in',
    footer_help_faqs: 'सामान्य प्रश्न (FAQs)',
    footer_help_feedback: 'नागरिक फीडबैक',
    footer_copyright: '© 2026 भारत सरकार / नगर निगम प्रशासन। सर्वाधिकार सुरक्षित।',
    footer_nic: 'डेटा-मीट एवं ओपन भू-स्थानिक मानकों द्वारा निर्मित',
  }
};

function getLang() {
  return localStorage.getItem('sunwai_lang') || 'en';
}

function setLang(lang) {
  if (lang !== 'en' && lang !== 'hi') lang = 'en';
  localStorage.setItem('sunwai_lang', lang);
  document.documentElement.setAttribute('lang', lang);

  renderHeader(window._currentPage || '');
  renderFooter();
  updateDomTranslations();

  if (typeof window.onLanguageChange === 'function') {
    window.onLanguageChange(lang);
  }
}

function t(key, fallback = '') {
  const lang = getLang();
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  return dict[key] !== undefined ? dict[key] : (fallback || key);
}

function updateDomTranslations() {
  const lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val) {
      if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
        el.value = val;
      } else {
        el.innerHTML = val;
      }
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = t(key);
    if (val) el.placeholder = val;
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    const val = t(key);
    if (val) el.title = val;
  });
}

function getAuthUser() {
  try {
    const raw = localStorage.getItem('sunwai_auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function getAuthToken() {
  return localStorage.getItem('sunwai_auth_token') || '';
}

function setAuthSession(user, token) {
  localStorage.setItem('sunwai_auth_user', JSON.stringify(user));
  if (token) localStorage.setItem('sunwai_auth_token', token);
}

function clearAuthSession() {
  localStorage.removeItem('sunwai_auth_user');
  localStorage.removeItem('sunwai_auth_token');
  window.location.href = 'index.html';
}

function requireAuth(allowedRoles = []) {
  const user = getAuthUser();
  if (!user) {
    window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname.split('/').pop())}`;
    return null;
  }
  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    alert(getLang() === 'hi' ? 'केवल अधिकृत अधिकारियों के लिए उपलब्ध।' : 'Access restricted to authorized personnel.');
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

async function api(method, url, body) {
  const opts = { method, headers: {} };
  const token = getAuthToken();
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;

  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

const getJSON = (url) => api('GET', url);
const postJSON = (url, body) => api('POST', url, body);
const patchJSON = (url, body) => api('PATCH', url, body);
const deleteJSON = (url) => api('DELETE', url);

function getDeviceId() {
  let id = localStorage.getItem('sunwai_device_id');
  if (!id) {
    id = 'anon-' + Math.random().toString(16).slice(2, 8);
    localStorage.setItem('sunwai_device_id', id);
  }
  return id;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function statusLabel(s) {
  const lang = getLang();
  const map = {
    reported: lang === 'hi' ? 'दर्ज' : 'Reported',
    acknowledged: lang === 'hi' ? 'स्वीकृत' : 'Acknowledged',
    in_progress: lang === 'hi' ? 'प्रगति पर' : 'In Progress',
    resolved: lang === 'hi' ? 'निस्तारित (सत्यापन प्रतीक्षित)' : 'Resolved (Awaiting Verification)',
    closed: lang === 'hi' ? 'बंद (नागरिक प्रमाणित)' : 'Closed (Citizen-Verified)',
  };
  return map[s] || s;
}

function categoryLabel(c) {
  const lang = getLang();
  const map = {
    pothole: lang === 'hi' ? 'सड़क का गड्ढा' : 'Pothole',
    streetlight: lang === 'hi' ? 'खराब स्ट्रीट लाइट' : 'Broken Streetlight',
    garbage: lang === 'hi' ? 'कचरे का ढेर / मलबा' : 'Garbage / Debris Clutter',
    water_leakage: lang === 'hi' ? 'जल रिसाव / जलभराव' : 'Water Leakage / Waterlogging',
    broken_infrastructure: lang === 'hi' ? 'क्षतिग्रस्त बुनियादी ढांचा' : 'Damaged Infrastructure',
    other: lang === 'hi' ? 'अन्य नागरिक समस्या' : 'Other Issue',
  };
  return map[c] || c;
}

function priorityLabel(p) {
  const lang = getLang();
  const up = (p || 'NORMAL').toUpperCase();
  if (lang === 'hi') {
    if (up === 'HIGH') return 'उच्च';
    if (up === 'MEDIUM') return 'मध्यम';
    return 'सामान्य';
  }
  return up;
}
window.priorityLabel = priorityLabel;

function timeAgo(iso) {
  const lang = getLang();
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) {
    return lang === 'hi' ? `${Math.max(1, mins)} मिनट पहले` : `${Math.max(1, mins)}m ago`;
  }
  const hrs = Math.round(mins / 60);
  if (hrs < 24) {
    return lang === 'hi' ? `${hrs} घंटे पहले` : `${hrs}h ago`;
  }
  const days = Math.round(hrs / 24);
  return lang === 'hi' ? `${days} दिन पहले` : `${days}d ago`;
}

function getFontScale() {
  const saved = localStorage.getItem('sunwai_font_scale');
  const parsed = parseFloat(saved);
  return (!isNaN(parsed) && parsed > 0) ? parsed : 1;
}

function setFontScale(scale) {
  const clamped = Math.min(1.8, Math.max(0.7, Math.round(scale * 100) / 100));
  document.documentElement.style.setProperty('--font-scale', clamped);
  localStorage.setItem('sunwai_font_scale', clamped.toString());

  const pct = Math.round(clamped * 100);
  const isHi = getLang() === 'hi';

  const btnReset = document.getElementById('btnFontReset');
  if (btnReset) {
    btnReset.setAttribute('title', isHi ? `मूल आकार पर रीसेट करें (${pct}%)` : `Reset to original font size (${pct}%)`);
  }
  const btnInc = document.getElementById('btnFontInc');
  if (btnInc) {
    btnInc.setAttribute('title', isHi ? `फ़ॉन्ट आकार 1% बढ़ाएं (${pct}%)` : `Increase font size by 1% (${pct}%)`);
  }
  const btnDec = document.getElementById('btnFontDec');
  if (btnDec) {
    btnDec.setAttribute('title', isHi ? `फ़ॉन्ट आकार 1% घटाएं (${pct}%)` : `Decrease font size by 1% (${pct}%)`);
  }
}

function increaseFontSize() {
  const current = getFontScale();
  setFontScale(current + 0.01);
}

function decreaseFontSize() {
  const current = getFontScale();
  setFontScale(current - 0.01);
}

function resetFontSize() {
  setFontScale(1.0);
}

function setFontSize(scale) {
  setFontScale(scale);
}

function updateThemeButton(isDark) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const isHi = getLang() === 'hi';
  if (isDark) {
    btn.innerHTML = '☀️';
    btn.setAttribute('title', isHi ? 'लाइट थीम पर स्विच करें (Alt+T)' : 'Switch to Light Theme (Alt+T)');
    btn.classList.add('active-dark');
  } else {
    btn.innerHTML = '🌙';
    btn.setAttribute('title', isHi ? 'डार्क थीम पर स्विच करें (Alt+T)' : 'Switch to Dark Theme (Alt+T)');
    btn.classList.remove('active-dark');
  }
}

function toggleTheme() {
  const isCurrentlyDark = document.body.classList.contains('dark-theme') || document.body.classList.contains('high-contrast');
  const targetDark = !isCurrentlyDark;

  document.body.classList.toggle('dark-theme', targetDark);
  document.body.classList.toggle('high-contrast', targetDark);
  document.documentElement.setAttribute('data-theme', targetDark ? 'dark' : 'light');

  localStorage.setItem('sunwai_theme', targetDark ? 'dark' : 'light');
  localStorage.setItem('sunwai_high_contrast', targetDark ? '1' : '0');
  updateThemeButton(targetDark);
}
window.toggleTheme = toggleTheme;
window.toggleContrast = toggleTheme;

(function initAccessibility() {
  const savedScale = localStorage.getItem('sunwai_font_scale');
  if (savedScale) document.documentElement.style.setProperty('--font-scale', savedScale);

  const isDark = localStorage.getItem('sunwai_theme') === 'dark' || localStorage.getItem('sunwai_high_contrast') === '1';
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    const applyTheme = () => {
      document.body.classList.add('dark-theme');
      document.body.classList.add('high-contrast');
      updateThemeButton(true);
    };
    if (document.body) {
      applyTheme();
    } else {
      document.addEventListener('DOMContentLoaded', applyTheme);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      toggleTheme();
    }
  });
})();

const ASHOKA_EMBLEM_SVG = `
<svg class="gov-emblem-svg" viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg">
  <path d="M50 5 C40 5 35 15 35 25 C35 35 42 42 45 46 C40 48 30 52 25 60 C20 68 22 78 28 84 C32 88 40 90 50 90 C60 90 68 88 72 84 C78 78 80 68 75 60 C70 52 60 48 55 46 C58 42 65 35 65 25 C65 15 60 5 50 5 Z" fill="#ffd700"/>
  <rect x="25" y="92" width="50" height="7" rx="2" fill="#ffd700"/>
  <rect x="20" y="101" width="60" height="5" rx="1" fill="#e5b800"/>
  <circle cx="50" cy="95.5" r="3" fill="#0b2546"/>
  <text x="50" y="113" font-family="serif" font-size="7" font-weight="bold" text-anchor="middle" fill="#ffd700">सत्यमेव जयते</text>
</svg>
`;

function renderHeader(current = '') {
  window._currentPage = current;
  const user = getAuthUser();
  const headerEl = document.getElementById('site-header');
  if (!headerEl) return;

  const lang = getLang();
  document.documentElement.setAttribute('lang', lang);

  let navHtml = '';
  if (user) {
    const isSuperAdmin = user.role === 'municipal_head' || user.isSuperAdmin;
    const isAdmin = user.role === 'admin';

    let roleBadgeText = t('ward_badge');
    if (isSuperAdmin) roleBadgeText = t('super_admin_badge');
    else if (isAdmin) roleBadgeText = t('admin_badge');

    navHtml = `
      <a href="index.html" class="${current === 'index.html' ? 'current' : ''}">${t('nav_citizen_portal')}</a>
      <a href="admin.html" class="${current === 'admin.html' ? 'current' : ''}">
        ${isSuperAdmin ? t('nav_head_center') : isAdmin ? t('nav_admin_center') : `${t('nav_ward_console')} (${user.assignedWard})`}
      </a>
      ${!isSuperAdmin ? `<a href="field.html" class="${current === 'field.html' ? 'current' : ''}">${t('nav_field_dispatch')}</a>` : ''}
      <div class="user-session-badge">
        <span><b>${user.name}</b> [${roleBadgeText}]</span>
        <button class="btn-logout" onclick="clearAuthSession()" title="${t('sign_out')}">${t('sign_out')}</button>
      </div>
    `;
  } else {
    navHtml = `
      <a href="index.html" class="${current === 'index.html' ? 'current' : ''}">${t('nav_file_grievance')}</a>
      <a href="index.html#track">${t('nav_track_status')}</a>
      <a href="index.html#map">${t('nav_issue_map')}</a>
      <a href="index.html#scores">${t('nav_ward_scores')}</a>
      <a href="login.html" class="btn-official-login ${current === 'login.html' ? 'current' : ''}">
        ${t('nav_official_login')}
      </a>
    `;
  }

  headerEl.innerHTML = `

    <div class="gov-topbar">
      <div class="gov-topbar-left">
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="gov-flag-icon">
            <div class="gov-flag-s1"></div>
            <div class="gov-flag-s2"></div>
            <div class="gov-flag-s3"></div>
          </div>
          <span><b>${t('gov_india')}</b></span>
        </div>
        <span style="opacity:0.4;">|</span>
        <span>${t('mohua')}</span>
      </div>
      <div class="gov-topbar-right">
        <div class="gov-helpline">
          <span>${t('helpline_label')}</span>
          <b>1916 / 1800-11-2026</b>
        </div>

        <div class="gov-lang-switcher">
          <span class="lang-label">${t('lang_label')}</span>
          <div class="lang-btn-group">
            <button type="button" class="lang-toggle-btn ${lang === 'en' ? 'active' : ''}" onclick="setLang('en')">English</button>
            <button type="button" class="lang-toggle-btn ${lang === 'hi' ? 'active' : ''}" onclick="setLang('hi')">हिन्दी</button>
          </div>
        </div>

        <div class="gov-access-controls">
          <button class="gov-access-btn ${(document.body && (document.body.classList.contains('dark-theme') || document.body.classList.contains('high-contrast'))) ? 'active-dark' : ''}" id="themeToggleBtn" onclick="toggleTheme()" title="${(document.body && (document.body.classList.contains('dark-theme') || document.body.classList.contains('high-contrast'))) ? (lang === 'hi' ? 'लाइट थीम पर स्विच करें (Alt+T)' : 'Switch to Light Theme (Alt+T)') : (lang === 'hi' ? 'डार्क थीम पर स्विच करें (Alt+T)' : 'Switch to Dark Theme (Alt+T)')}">${(document.body && (document.body.classList.contains('dark-theme') || document.body.classList.contains('high-contrast'))) ? '☀️' : '🌙'}</button>
          <button class="gov-access-btn" id="btnFontDec" onclick="decreaseFontSize()" title="${lang === 'hi' ? 'फ़ॉन्ट आकार 1% घटाएं' : 'Decrease font size by 1%'}">A-</button>
          <button class="gov-access-btn" id="btnFontReset" onclick="resetFontSize()" title="${lang === 'hi' ? 'मूल फ़ॉन्ट आकार पर रीसेट करें' : 'Restore original font size'}">A</button>
          <button class="gov-access-btn" id="btnFontInc" onclick="increaseFontSize()" title="${lang === 'hi' ? 'फ़ॉन्ट आकार 1% बढ़ाएं' : 'Increase font size by 1%'}">A+</button>
        </div>
      </div>
    </div>

    <div class="tricolour-bar">
      <div class="t-saffron"></div>
      <div class="t-white"></div>
      <div class="t-green"></div>
    </div>

    <header class="gov-main-header">
      <div class="gov-brand-container">
        <a href="index.html" class="gov-logo-link" title="Sunwai Portal">
          <img src="sunwai-logo.png" alt="SUNWAI Official Logo" class="gov-portal-logo">
        </a>
        <div class="gov-brand-divider"></div>
        ${ASHOKA_EMBLEM_SVG}
        <div>
          <div class="gov-sub-title">
            ${t('portal_sub')}
          </div>
        </div>
      </div>
      <nav class="gov-nav">
        ${navHtml}
      </nav>
    </header>
  `;
}

function renderFooter() {
  const footerEl = document.querySelector('footer');
  if (!footerEl) return;
  footerEl.className = 'gov-footer';
  footerEl.innerHTML = `
    <div class="gov-footer-content">
      <div>
        <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;font-family:var(--gov-font-serif);">
          ${t('portal_brand')} · SUNWAI
        </div>
        <p style="margin:0 0 12px;color:#94a3b8;line-height:1.6;">
          ${t('footer_desc')}
        </p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:#cbd5e1;">
          <span>${t('footer_gigw')}</span>
          <span>${t('footer_ssl')}</span>
        </div>
      </div>

      <div class="gov-footer-links">
        <h4>${t('footer_policies_title')}</h4>
        <ul>
          <li><a href="#">${t('footer_policy_terms')}</a></li>
          <li><a href="#">${t('footer_policy_privacy')}</a></li>
          <li><a href="#">${t('footer_policy_charter')}</a></li>
          <li><a href="#">${t('footer_policy_hyperlink')}</a></li>
        </ul>
      </div>

      <div class="gov-footer-links">
        <h4>${t('footer_help_title')}</h4>
        <ul>
          <li><a href="#">${t('footer_help_helpline')}</a></li>
          <li><a href="#">${t('footer_help_email')}</a></li>
          <li><a href="#">${t('footer_help_faqs')}</a></li>
          <li><a href="#">${t('footer_help_feedback')}</a></li>
        </ul>
      </div>
    </div>

    <div class="gov-footer-bottom">
      <div>
        ${t('footer_copyright')}
      </div>
      <div class="nic-badge">
        <span>${t('footer_nic')}</span>
      </div>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  renderFooter();
  updateDomTranslations();
});

function renderBoundingBoxes(canvasEl, imgEl, detections) {
  if (!canvasEl || !imgEl) return;
  const ctx = canvasEl.getContext('2d');
  const w = imgEl.naturalWidth || imgEl.width || 640;
  const h = imgEl.naturalHeight || imgEl.height || 640;

  canvasEl.width = w;
  canvasEl.height = h;
  ctx.clearRect(0, 0, w, h);

  if (!detections || !detections.length) return;

  const lang = (typeof getLang === 'function') ? getLang() : 'en';

  const catMeta = {
    pothole: { color: '#dc2626', label: lang === 'hi' ? 'सड़क का गड्ढा' : 'POTHOLE' },
    water_leakage: { color: '#0284c7', label: lang === 'hi' ? 'जलभराव / लीकेज' : 'WATER ACCUMULATION' },
    garbage: { color: '#16a34a', label: lang === 'hi' ? 'कचरा / मलबा' : 'GARBAGE / DEBRIS' },
    streetlight: { color: '#f59e0b', label: lang === 'hi' ? 'स्ट्रीट लाइट' : 'STREETLIGHT' },
    broken_infrastructure: { color: '#9333ea', label: lang === 'hi' ? 'क्षतिग्रस्त ढांचा' : 'BROKEN INFRA' },
    other: { color: '#475569', label: lang === 'hi' ? 'अन्य नागरिक समस्या' : 'CIVIC ISSUE' },
  };

  const occupiedBadges = [];

  detections.forEach((d) => {
    if (!d.bbox || d.bbox.length !== 4) return;
    const [x1, y1, x2, y2] = d.bbox;
    const meta = catMeta[d.category] || catMeta.other;
    const conf = Math.round((d.confidence || 0) * 100);

    ctx.fillStyle = meta.color + '1c';
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

    ctx.strokeStyle = meta.color;
    ctx.lineWidth = Math.max(3, Math.round(w / 180));
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    const label = `${meta.label} ${conf}%`;
    const fontSize = Math.max(12, Math.round(w / 40));
    ctx.font = `bold ${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const padding = 5;
    const badgeW = textWidth + padding * 2;
    const badgeH = fontSize + padding * 2;

    let bx1 = Math.max(0, x1);
    let by1 = Math.max(0, y1 - badgeH);

    const isColliding = occupiedBadges.some(b => {
      return !(bx1 + badgeW < b.x || bx1 > b.x + b.w || by1 + badgeH < b.y || by1 > b.y + b.h);
    });

    if (isColliding) {
      if (y2 + badgeH <= h) {
        by1 = y2 + 2;
      } else {
        by1 = Math.min(h - badgeH, y1 + 4);
      }
    }

    occupiedBadges.push({ x: bx1, y: by1, w: badgeW, h: badgeH });

    ctx.fillStyle = meta.color;
    ctx.fillRect(bx1, by1, badgeW, badgeH);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, bx1 + padding, by1 + fontSize + padding - 2);
  });
}
window.renderBoundingBoxes = renderBoundingBoxes;

function renderAiCategoryBars(containerEl, allCategories, primaryCategory, onSelectCategory = null) {
  if (!containerEl) return;

  if (!allCategories || !allCategories.length) {
    containerEl.style.display = 'none';
    containerEl.innerHTML = '';
    return;
  }

  const lang = (typeof getLang === 'function') ? getLang() : 'en';

  const catMeta = {
    pothole: {
      icon: '🕳️',
      name: lang === 'hi' ? 'सड़क का गड्ढा' : 'Pothole',
      color: '#dc2626',
      class: 'bar-pothole',
    },
    water_leakage: {
      icon: '💧',
      name: lang === 'hi' ? 'जल रिसाव / जलभराव' : 'Water Leakage / Waterlogging',
      color: '#0284c7',
      class: 'bar-water_leakage',
    },
    broken_infrastructure: {
      icon: '🏗️',
      name: lang === 'hi' ? 'क्षतिग्रस्त बुनियादी ढांचा' : 'Damaged Infrastructure',
      color: '#7c3aed',
      class: 'bar-broken_infrastructure',
    },
    garbage: {
      icon: '🗑️',
      name: lang === 'hi' ? 'कचरे का ढेर / मलबा' : 'Garbage / Debris Clutter',
      color: '#059669',
      class: 'bar-garbage',
    },
    streetlight: {
      icon: '💡',
      name: lang === 'hi' ? 'खराब स्ट्रीट लाइट' : 'Broken Streetlight',
      color: '#d97706',
      class: 'bar-streetlight',
    },
    other: {
      icon: '📌',
      name: lang === 'hi' ? 'अन्य नागरिक समस्या' : 'Other Issue',
      color: '#64748b',
      class: 'bar-other',
    },
  };

  const MIN_DETECTION_THRESHOLD = 25;
  const detectedCategories = allCategories
    .filter((item) => {
      const pct = typeof item.percentage === 'number' ? item.percentage : Math.round((item.confidence || 0) * 100);
      return (item.category === primaryCategory && pct > 0) || pct >= MIN_DETECTION_THRESHOLD;
    })
    .slice(0, 3);

  if (!detectedCategories.length) {
    containerEl.style.display = 'none';
    containerEl.innerHTML = '';
    return;
  }

  const isSingle = detectedCategories.length === 1;
  const titleText = lang === 'hi'
    ? '📊 दृश्य पहचान संभाव्यता एवं सांख्यिकी'
    : '📊 Visual Classification Probabilities & Stats';
  const subtitleText = isSingle
    ? (lang === 'hi' ? 'पुष्ट दृश्य पहचान (सटीक मिलान)' : 'Confirmed Visual Detection (High Accuracy)')
    : (lang === 'hi' ? `शीर्ष ${detectedCategories.length} पहचानी गई नागरिक समस्याएं` : `Top ${detectedCategories.length} Visible Civic Issues Detected`);
  const primaryBadgeText = lang === 'hi' ? 'मुख्य पहचान' : 'Primary Match';
  const hintText = isSingle
    ? (lang === 'hi' ? 'यह समस्या फोटो में स्पष्ट रूप से पहचानी गई है और स्वचालित रूप से चयनित है।' : 'Visibly verified in uploaded photo and automatically selected.')
    : (lang === 'hi' ? 'सुझाव: जिस समस्या की रिपोर्ट करना चाहते हैं, उस श्रेणी पट्टी पर क्लिक करके मुख्य श्रेणी के रूप में चुन सकते हैं।' : 'Tip: Click any detected category bar to select it as your primary grievance category.');

  function buildRow(item) {
    const cat = item.category || 'other';
    const meta = catMeta[cat] || catMeta.other;
    const pct = typeof item.percentage === 'number' ? item.percentage : Math.round((item.confidence || 0) * 100);
    const isPrimary = cat === primaryCategory;

    return `
      <div class="ai-stat-row ${isPrimary ? 'selected' : ''}" data-cat="${cat}" title="${lang === 'hi' ? 'इसे चुनने के लिए क्लिक करें' : 'Click to select ' + meta.name}">
        <div class="ai-stat-info">
          <span class="ai-stat-label">
            <span>${meta.icon}</span>
            <span>${meta.name}</span>
            ${isPrimary ? `<span class="ai-stat-tag">★ ${primaryBadgeText}</span>` : ''}
          </span>
          <span class="ai-stat-pct" style="color:${meta.color};">${pct}%</span>
        </div>
        <div class="ai-stat-bar-track">
          <div class="ai-stat-bar-fill ${meta.class}" data-pct="${pct}" style="width:0%;"></div>
        </div>
      </div>
    `;
  }

  const mainRowsHtml = detectedCategories.map(buildRow).join('');

  containerEl.innerHTML = `
    <div class="ai-stats-panel">
      <div class="ai-stats-header">
        <div class="ai-stats-title">${titleText}</div>
        <div class="ai-stats-subtitle">${subtitleText}</div>
      </div>
      <div class="ai-stats-rows">
        ${mainRowsHtml}
      </div>
      <div class="ai-stat-hint">${hintText}</div>
    </div>
  `;
  containerEl.style.display = 'block';

  requestAnimationFrame(() => {
    setTimeout(() => {
      containerEl.querySelectorAll('.ai-stats-rows .ai-stat-bar-fill').forEach((bar) => {
        const pct = bar.getAttribute('data-pct');
        bar.style.width = `${pct}%`;
      });
    }, 50);
  });

  containerEl.querySelectorAll('.ai-stat-row').forEach((row) => {
    row.addEventListener('click', () => {
      const cat = row.getAttribute('data-cat');
      containerEl.querySelectorAll('.ai-stat-row').forEach((r) => r.classList.remove('selected'));
      row.classList.add('selected');

      if (typeof onSelectCategory === 'function') {
        onSelectCategory(cat);
      } else if (typeof onSelectCategory === 'string') {
        const selectEl = document.getElementById(onSelectCategory);
        if (selectEl) {
          selectEl.value = cat;
          selectEl.dispatchEvent(new Event('change'));
        }
      } else {
        const defaultSelect = document.getElementById('categorySelect');
        if (defaultSelect) {
          defaultSelect.value = cat;
          defaultSelect.dispatchEvent(new Event('change'));
        }
      }
    });
  });
}
window.renderAiCategoryBars = renderAiCategoryBars;
