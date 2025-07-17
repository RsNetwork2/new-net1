document.addEventListener('DOMContentLoaded', async () => {
    // --- CONFIGURATION ---
    const CONFIG = {
        defaultLang: 'bn',
        defaultTheme: 'light',
        mailerURL: './jm-scripts/mailer.php',
        csrfTokenURL: './jm-scripts/get-csrf-token.php',
        contentPaths: {
            translations: './jm-contents/translations.json',
            services: './jm-contents/services.json',
            packages: './jm-contents/packages.json',
            coverage: './jm-contents/coverage.json',
            testimonials: './jm-contents/testimonials.json',
            contacts: './jm-contents/contacts.json',
        },
        policyPaths: {
            terms: './jm-policies/terms.json',
            usage: './jm-policies/usage.json',
            privacy: './jm-policies/privacy.json',
            refund: './jm-policies/refund.json',
        }
    };

    // --- GLOBAL STATE ---
    let SITE_DATA = {
        policies: {},
        translations: {},
        csrfToken: null
    };
    let currentLang, currentTheme, revealObserver;
    let gaugeCircumference;
    const delay = ms => new Promise(res => setTimeout(res, ms));

    // --- DOM ELEMENTS CACHING---
    const dom = {};
    const elementIds = [
        'main-header', 'main-nav', 'quick-pay-btn', 'theme-toggle', 'theme-icon', 'lang-toggle', 'mobile-menu-button',
        'header-theme-toggle-mobile', 'header-theme-icon-mobile',
        'mobile-menu', 'mobile-quick-pay-btn', 'hero-bg',
        'about', 'services', 'services-container', 'packages', 'packages-container', 'special-packages-container',
        'speed-test', 'speed-gauge-svg', 'gauge-fg-circle', 'speed-value', 'ping-value', 'download-value',
        'upload-value', 'start-speed-test-btn', 'coverage', 'coverage-area-select', 'check-coverage-btn', 'coverage-result',
        'testimonials', 'testimonial-slider', 'testimonial-slider-container', 'testimonial-prev-btn', 'testimonial-next-btn',
        'contact', 'contact-form', 'contact-status', 'support', 'footer-quick-pay', 'copyright-text', 'quick-pay-modal', 'user-id',
        'modal-checkout-btn', 'policy-modal', 'policy-title', 'policy-content', 'subscription-modal', 'subscription-form-view',
        'selected-package-text', 'subscription-form', 'hidden-package-name', 'terms-agree', 'submit-request-btn',
        'scroll-to-top', 'form-success-modal', 'support-rating-stat', 'dob', 'subscription-status'
    ];
    elementIds.forEach(id => {
        const camelCaseId = id.replace(/-([a-z])/g, g => g[1].toUpperCase());
        const element = document.getElementById(id);
        if (element) dom[camelCaseId] = element;
    });
    dom.body = document.body;
    dom.closeModalBtns = document.querySelectorAll('.close-modal-btn');
    dom.progressRing = document.querySelector('.progress-ring-indicator');
    dom.navLinks = document.querySelectorAll('.nav-link');


    // --- CORE FUNCTIONS ---
    async function fetchJson(url) {
        try {
            const response = await fetch(url, {
                cache: 'no-cache'
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${url}`);
            const text = await response.text();
            if (!text) {
                console.warn(`Empty response for ${url}.`);
                return null;
            }
            try {
                return JSON.parse(text);
            } catch (parseError) {
                console.error(`Invalid JSON in ${url}.`, text);
                throw new Error(`Invalid JSON format in ${url}.`);
            }
        } catch (error) {
            console.error(`Fetch/Parse error for ${url}:`, error);
            return null;
        }
    }

    async function getCsrfToken() {
        try {
            const data = await fetchJson(CONFIG.csrfTokenURL);
            if (data && data.csrf_token) {
                SITE_DATA.csrfToken = data.csrf_token;
            } else {
                throw new Error("CSRF token not received from server.");
            }
        } catch (error) {
            console.error("Critical: Could not fetch CSRF token.", error);
            dom.body.innerHTML = `<div style="padding:2rem;text-align:center;color:white;background-color:#0D1117;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;"><h1>Security Error</h1><p>Could not establish a secure connection. Please refresh.</p></div>`;
        }
    }

    async function fetchAllData() {
        const promises = Object.entries(CONFIG.contentPaths).concat(Object.entries(CONFIG.policyPaths))
            .map(async ([key, path]) => ({
                key,
                data: await fetchJson(path),
                isPolicy: !!CONFIG.policyPaths[key]
            }));
        const results = await Promise.all(promises);
        results.forEach(({
            key,
            data,
            isPolicy
        }) => {
            if (data) {
                if (isPolicy) SITE_DATA.policies[key] = data;
                else SITE_DATA[key] = data;
            } else {
                console.warn(`No data loaded for '${key}'.`);
            }
        });
    }

    function applyTranslations(lang) {
        const year = new Date().getFullYear();
        if (!SITE_DATA.translations || !SITE_DATA.translations[lang]) return;

        document.querySelectorAll('[data-key]').forEach(el => {
            const key = el.dataset.key;
            const translation = SITE_DATA.translations[lang][key] || SITE_DATA.translations['en'][key];

            if (translation) {
                if (key === 'footer_copyright') {
                    el.textContent = translation.replace('{year}', year);
                } else if (el.hasAttribute('placeholder')) {
                    el.placeholder = translation;
                } else if (['hero_heading'].includes(key)) {
                    el.innerHTML = translation;
                } else {
                    el.textContent = translation;
                }
            }
        });
        document.title = SITE_DATA.translations[lang].page_title || 'Sinthia Telecom';
    }

    function applyContactLinks() {
        if (!SITE_DATA.contacts) return;
        document.querySelectorAll('[data-contact-key]').forEach(el => {
            const key = el.dataset.contactKey;
            const contactInfo = SITE_DATA.contacts[key];
            if (!contactInfo) return;
            if (el.tagName === 'A') {
                if (key === 'email') {
                    el.href = `mailto:${contactInfo}`;
                } else if (key === 'hotline') {
                    el.href = `tel:${contactInfo.replace(/\s/g, '')}`;
                } else {
                    el.href = contactInfo;
                }
            } else if (el.tagName === 'P') {
                el.textContent = contactInfo;
            }
        });
    }

    // --- MODULES ---

    const ThemeManager = {
        init() {
            const initialTheme = document.documentElement.classList.contains('light-mode') ? 'light' : 'dark';
            currentTheme = initialTheme;
            this.updateIcons(initialTheme);

            if (dom.themeToggle) dom.themeToggle.addEventListener('click', () => this.toggle());
            if (dom.headerThemeToggleMobile) dom.headerThemeToggleMobile.addEventListener('click', () => this.toggle());
        },
        updateIcons(theme) {
            const isLight = theme === 'light';
            [dom.themeIcon, dom.headerThemeIconMobile].forEach(icon => {
                if (icon) {
                    icon.classList.toggle('fa-sun', isLight);
                    icon.classList.toggle('fa-moon', !isLight);
                }
            });
        },
        apply(theme) {
            currentTheme = theme;
            document.documentElement.classList.toggle('light-mode', theme === 'light');
            localStorage.setItem('theme', theme);
            this.updateIcons(theme);
        },
        toggle() {
            this.apply(currentTheme === 'light' ? 'dark' : 'light');
        }
    };

    const LanguageManager = {
        init() {
            const savedLang = localStorage.getItem('lang');
            this.apply(savedLang || CONFIG.defaultLang);
            if (dom.langToggle) dom.langToggle.addEventListener('click', () => this.toggle());
        },
        apply(lang) {
            currentLang = lang;
            document.documentElement.lang = lang;
            document.body.classList.toggle('lang-bn', lang === 'bn');
            renderDynamicContent();
            localStorage.setItem('lang', lang);
            updateRevealObserver();
        },
        toggle() {
            this.apply(currentLang === 'en' ? 'bn' : 'en');
        }
    };

    const ModalManager = {
        init() {
            document.body.addEventListener('click', e => {
                const target = e.target;
                const quickPayBtn = target.closest('#quick-pay-btn, #mobile-quick-pay-btn, #footer-quick-pay');
                const policyBtn = target.closest('.policy-btn');
                const closeModalBtn = target.closest('.close-modal-btn');

                if (quickPayBtn) {
                    if (quickPayBtn.id === 'mobile-quick-pay-btn') this.closeMobileMenu();
                    this.open(dom.quickPayModal);
                } else if (policyBtn) {
                    e.preventDefault();
                    this.showPolicy(policyBtn.dataset.policy);
                } else if (closeModalBtn) {
                    this.close(closeModalBtn.closest('.modal-overlay'));
                } else if (target.matches('.modal-overlay.primary')) {
                    this.close(target);
                } else if (target.id === 'modal-checkout-btn') {
                    this.handleCheckout();
                }
            });

            window.addEventListener('popstate', (e) => {
                const openModal = document.querySelector('.modal-overlay.open');
                if (openModal) {
                    this.close(openModal, true);
                }
            });

            document.addEventListener('keydown', e => {
                if (e.key === "Escape") {
                    const openModal = document.querySelector('.modal-overlay.open');
                    if (openModal) {
                        this.close(openModal);
                    }
                }
            });
        },
        open(modal) {
            if (modal && !modal.classList.contains('open')) {
                modal.classList.add('open');
                const form = modal.querySelector('form');
                if (form) injectCsrfToken(form);
                history.pushState({
                    modalId: modal.id
                }, `Modal Open`, `#${modal.id}`);
            }
        },
        close(modal, fromPopState = false) {
            if (modal && modal.classList.contains('open')) {
                modal.classList.remove('open');
                if (!fromPopState && location.hash === `#${modal.id}`) {
                    history.back();
                }
            }
        },
        closeMobileMenu() {
            if (dom.mobileMenu) {
                dom.mobileMenu.classList.add('hidden');
                dom.body.classList.remove('menu-open');
            }
        },
        showPolicy(key) {
            if (!SITE_DATA.policies || !SITE_DATA.policies[key]) return;
            const policy = SITE_DATA.policies[currentLang] ? .[key] || SITE_DATA.policies['en'][key];
            if (!policy) return;
            dom.policyTitle.textContent = policy.title;
            dom.policyContent.innerHTML = policy.content;
            this.open(dom.policyModal);
        },
        handleCheckout() {
            const userId = dom.userId.value.trim();
            if (userId) {
                window.open(`${SITE_DATA.contacts?.quickPayBaseUrl || 'https://isperp.sinthiaisp.net/portal/quick-pay/'}${userId}`, '_blank');
            } else {
                dom.userId.focus();
                dom.userId.classList.add('ring-2', 'ring-red-500');
                setTimeout(() => dom.userId.classList.remove('ring-2', 'ring-red-500'), 2000);
            }
        }
    };

    function renderDynamicContent() {
        if (!SITE_DATA || Object.keys(SITE_DATA).length < 2) {
            return;
        };
        renderServices();
        renderPackages();
        populateCoverageOptions();
        renderTestimonials();
        applyContactLinks();
        applyTranslations(currentLang);
    }

    function renderServices() {
        if (!dom.servicesContainer || !SITE_DATA.services) return;
        dom.servicesContainer.innerHTML = SITE_DATA.services.map((service, i) => `
            <div class="content-card p-8 text-center reveal-on-scroll group" style="--delay: ${i*0.1}s;">
                <div class="icon-wrapper bg-primary"><i class="fas ${service.icon} text-3xl" style="color:${service.color};"></i></div>
                <h3 class="font-semibold text-primary text-xl mb-3" data-key="${service.title_key}"></h3>
                <p class="text-sm text-secondary" data-key="${service.desc_key}"></p>
            </div>`).join('');
    }

    function renderPackages() {
        if (!SITE_DATA.packages) return;
        const renderPackage = (pkg, i, isSpecial) => {
            const priceText = currentLang === 'bn' ? `৳ ${pkg.price}` : `BDT ${pkg.price}`;
            const perMonthText = currentLang === 'bn' ? 'মাস' : 'mo';

            return `<div class="content-card p-6 flex flex-col reveal-on-scroll" style="--delay: ${i*0.05}s;">
                <div class="flex-grow">
                    <h3 class="font-bold text-primary text-xl mb-2">${pkg.name}</h3>
                    <p class="text-6xl font-black my-4" style="color:var(--${pkg.color})">${pkg.speed}<span class="text-3xl font-bold">Mbps</span></p>
                    <p class="text-3xl font-bold text-primary mb-6">${priceText}<span class="text-base font-medium text-secondary">/${perMonthText}</span></p>
                    ${!isSpecial ? `<div class="space-y-3 text-sm text-secondary border-t border-color pt-4 mt-4">
                        <p class="flex items-center gap-3"><i class="fab fa-facebook text-blue-500 w-4 text-center"></i> Facebook: ${pkg.features.fb} Mbps</p>
                        <p class="flex items-center gap-3"><i class="fab fa-youtube text-red-500 w-4 text-center"></i> YouTube: ${pkg.features.yt} Mbps</p>
                        <p class="flex items-center gap-3"><i class="fas fa-server text-green-400 w-4 text-center"></i> BDIX: ${pkg.features.bdix} Mbps</p>
                        <p class="flex items-center gap-3"><i class="fas fa-download text-yellow-400 w-4 text-center"></i> FTP: ${pkg.features.ftp} Mbps</p>
                    </div>` : `<div class="border-t border-color text-center pt-4 mt-4">
                        <p class="text-xs text-secondary" data-key="contention_ratio"></p>
                    </div>`}
                </div>
                <button class="package-cta-btn btn-primary mt-6 w-full block py-3 text-center" data-package-name="${pkg.name}" data-key="package_cta"></button>
            </div>`;
        };

        if (dom.packagesContainer && SITE_DATA.packages.standard) dom.packagesContainer.innerHTML = SITE_DATA.packages.standard.map((pkg, i) => renderPackage(pkg, i, false)).join('');
        if (dom.specialPackagesContainer && SITE_DATA.packages.special) dom.specialPackagesContainer.innerHTML = SITE_DATA.packages.special.map((pkg, i) => renderPackage(pkg, i, true)).join('');
    }

    function populateCoverageOptions() {
        if (!dom.coverageAreaSelect || !SITE_DATA.coverage || !SITE_DATA.translations) return;
        const placeholderKey = 'coverage_select_placeholder';
        const placeholder = SITE_DATA.translations[currentLang] ? .[placeholderKey] || SITE_DATA.translations['en'][placeholderKey] || 'Select an area...';

        dom.coverageAreaSelect.innerHTML = `<option value="" disabled selected>${placeholder}</option>` + SITE_DATA.coverage
            .sort((a, b) => a.name.en.localeCompare(b.name.en))
            .map(area => {
                const displayName = currentLang === 'bn' && area.name.bn ?
                    `${area.name.en} (${area.name.bn})` :
                    area.name.en;
                return `<option value="${area.value}">${displayName}</option>`;
            }).join('');
    }

    function handleCoverageCheck() {
        if (!SITE_DATA.coverage || !dom.coverageResult) return;
        const selectedAreaValue = dom.coverageAreaSelect.value;
        if (!selectedAreaValue) return;
        const areaData = SITE_DATA.coverage.find(area => area.value === selectedAreaValue);
        const resultWrapper = dom.coverageResult;

        const lang = currentLang || 'en';
        const statusMap = {
            available: {
                msgKey: 'coverage_available',
                class: 'text-green-400'
            },
            coming_soon: {
                msgKey: 'coverage_coming_soon',
                class: 'text-yellow-400'
            },
            unavailable: {
                msgKey: 'coverage_unavailable',
                class: 'text-red-400'
            }
        };
        const resultInfo = statusMap[areaData ? .status] || statusMap.unavailable;
        const message = SITE_DATA.translations[lang] ? .[resultInfo.msgKey] || SITE_DATA.translations['en'][resultInfo.msgKey];

        resultWrapper.innerHTML = `<div class="pt-4"><p class="${resultInfo.class} animate-pulse">${message}</p></div>`;
        resultWrapper.style.height = `${resultWrapper.scrollHeight}px`;
        resultWrapper.classList.remove('opacity-0');
    }

    function renderTestimonials() {
        if (!dom.testimonialSlider || !SITE_DATA.testimonials) return;

        if (SITE_DATA.testimonials.length > 0) {
            const avgRating = (SITE_DATA.testimonials.reduce((acc, t) => acc + t.rating, 0) / SITE_DATA.testimonials.length).toFixed(1);
            if (dom.supportRatingStat) {
                dom.supportRatingStat.dataset.target = avgRating;
                if (dom.supportRatingStat.closest('.reveal-on-scroll') ? .classList.contains('is-visible')) {
                    animateNumber(dom.supportRatingStat);
                }
            }
        }

        dom.testimonialSlider.innerHTML = SITE_DATA.testimonials.map((t) => `<div class="testimonial-slide"><div class="content-card p-8 max-w-lg mx-auto text-center"><i class="fas fa-quote-left text-4xl text-blue-500/30 absolute top-4 left-6"></i><p class="text-primary text-lg font-medium leading-relaxed my-6">${t.quote[currentLang] || t.quote.en}</p><div class="mt-4"><div class="star-rating mb-2">${Array(5).fill(0).map((_, i) => `<i class="fa-solid fa-star ${i < t.rating ? 'text-blue-500' : 'text-gray-600'}"></i>`).join('')}</div><p class="font-bold text-primary">${t.name}</p></div></div></div>`).join('');
        initTestimonialSlider();
    }

    function initTestimonialSlider() {
        const slider = dom.testimonialSlider;
        if (!slider || slider.children.length === 0) return;

        const slides = Array.from(slider.children);
        let currentIndex = 0;
        let startX = 0;
        let diffX = 0;
        let isDragging = false;
        let intervalId;

        const updateClasses = () => {
            slides.forEach((slide, i) => {
                let newClass = 'hidden-prev';
                if (i === currentIndex) {
                    newClass = 'active';
                } else if (i === (currentIndex + 1) % slides.length) {
                    newClass = 'next';
                } else if (i === (currentIndex - 1 + slides.length) % slides.length) {
                    newClass = 'prev';
                } else if (i === (currentIndex + 2) % slides.length && slides.length > 3) {
                    newClass = 'hidden-next';
                }
                slide.className = 'testimonial-slide ' + newClass;
            });
        };

        const goTo = index => {
            currentIndex = (index + slides.length) % slides.length;
            updateClasses();
        };
        const next = () => goTo(currentIndex + 1);
        const prev = () => goTo(currentIndex - 1);

        const startAutoPlay = () => {
            if (intervalId) clearInterval(intervalId);
            intervalId = setInterval(next, 5000);
        };
        const stopAutoPlay = () => clearInterval(intervalId);

        const dragStart = e => {
            isDragging = true;
            startX = e.pageX || e.touches[0].pageX;
            slider.style.cursor = 'grabbing';
            stopAutoPlay();
        };
        const dragMove = e => {
            if (!isDragging) return;
            diffX = (e.pageX || e.touches[0].pageX) - startX;
        };
        const dragEnd = () => {
            isDragging = false;
            slider.style.cursor = 'grab';
            if (Math.abs(diffX) > 50) {
                if (diffX > 0) prev();
                else next();
            }
            diffX = 0;
            startAutoPlay();
        };

        if (dom.testimonialPrevBtn) dom.testimonialPrevBtn.addEventListener('click', () => {
            prev();
            stopAutoPlay();
            startAutoPlay();
        });
        if (dom.testimonialNextBtn) dom.testimonialNextBtn.addEventListener('click', () => {
            next();
            stopAutoPlay();
            startAutoPlay();
        });

        slider.addEventListener('mousedown', dragStart);
        slider.addEventListener('touchstart', dragStart, {
            passive: true
        });
        slider.addEventListener('mousemove', dragMove);
        slider.addEventListener('touchmove', dragMove, {
            passive: true
        });
        slider.addEventListener('mouseup', dragEnd);
        slider.addEventListener('mouseleave', dragEnd);
        slider.addEventListener('touchend', dragEnd);

        updateClasses();
        startAutoPlay();
    }

    function initSpeedTest() {
        if (!dom.startSpeedTestBtn || !dom.gaugeFgCircle) return;
        gaugeCircumference = dom.gaugeFgCircle.getTotalLength();
        dom.gaugeFgCircle.style.strokeDasharray = gaugeCircumference;
        dom.gaugeFgCircle.style.strokeDashoffset = gaugeCircumference;
        dom.startSpeedTestBtn.addEventListener('click', runSpeedTest);
    }

    async function runSpeedTest() {
        const lang = currentLang || 'en';
        dom.startSpeedTestBtn.disabled = true;
        dom.startSpeedTestBtn.innerHTML = `<span data-key="speedtest_testing_btn">${SITE_DATA.translations[lang]?.speedtest_testing_btn || 'Testing...'}</span>`;
        const resultBoxes = [dom.pingValue.parentElement, dom.downloadValue.parentElement, dom.uploadValue.parentElement];
        resultBoxes.forEach(box => box.classList.remove('highlight'));
        dom.pingValue.textContent = '- ms';
        dom.downloadValue.textContent = '- Mbps';
        dom.uploadValue.textContent = '- Mbps';
        dom.gaugeFgCircle.style.transition = 'stroke-dashoffset 0.5s ease-out';
        dom.gaugeFgCircle.style.strokeDashoffset = gaugeCircumference;
        const randomPing = Math.floor(Math.random() * 20) + 5;
        const randomDownload = (Math.random() * 80 + 20);
        const randomUpload = (Math.random() * 70 + 15);
        await delay(500);
        dom.pingValue.textContent = `${randomPing} ms`;
        await delay(500);
        dom.gaugeFgCircle.setAttribute('stroke', 'url(#downloadGradient)');
        await animateGauge(randomDownload, 4000, dom.downloadValue);
        dom.gaugeFgCircle.style.transition = 'stroke-dashoffset 0.5s ease-out';
        dom.gaugeFgCircle.style.strokeDashoffset = gaugeCircumference;
        await delay(500);
        dom.gaugeFgCircle.setAttribute('stroke', 'url(#uploadGradient)');
        await animateGauge(randomUpload, 4000, dom.uploadValue);
        dom.gaugeFgCircle.style.transition = 'stroke-dashoffset 1s ease-out';
        dom.gaugeFgCircle.style.strokeDashoffset = gaugeCircumference;
        setTimeout(() => resultBoxes.forEach(box => box.classList.add('highlight')), 100);
        dom.startSpeedTestBtn.disabled = false;
        dom.startSpeedTestBtn.innerHTML = `<span data-key="speedtest_start_btn">${SITE_DATA.translations[lang]?.speedtest_start_btn || 'Begin Test'}</span>`;
    }

    function animateGauge(speed, duration, elementToUpdate) {
        return new Promise(resolve => {
            const maxSpeed = 100;
            const progress = Math.min(speed / maxSpeed, 1);
            const offset = gaugeCircumference * (1 - progress);
            dom.gaugeFgCircle.style.transition = `stroke-dashoffset ${duration/1000}s linear`;
            dom.gaugeFgCircle.style.strokeDashoffset = offset;
            let currentSpeed = 0;
            const stepTime = 50;
            const steps = duration / stepTime;
            const increment = speed / steps;
            const interval = setInterval(() => {
                currentSpeed += increment;
                if (currentSpeed >= speed) {
                    currentSpeed = speed;
                    clearInterval(interval);
                    dom.speedValue.textContent = currentSpeed.toFixed(2);
                    if (elementToUpdate) elementToUpdate.textContent = `${currentSpeed.toFixed(2)} Mbps`;
                    resolve();
                } else {
                    dom.speedValue.textContent = currentSpeed.toFixed(2);
                    if (elementToUpdate) elementToUpdate.textContent = `${currentSpeed.toFixed(2)} Mbps`;
                }
            }, stepTime);
        });
    }

    function initScrollFeatures() {
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    const statNumbers = entry.target.querySelectorAll('.stat-number');
                    statNumbers.forEach(num => {
                        if (!num.dataset.animated) {
                            animateNumber(num);
                            num.dataset.animated = 'true';
                        }
                    });
                    revealObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1
        });
        updateRevealObserver();

        const sections = document.querySelectorAll('main section[id]');
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    let id = entry.target.id;
                    if (id === 'support') id = 'contact';
                    dom.navLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') ? .substring(1) === id) {
                            link.classList.add('active');
                        }
                    });
                }
            });
        }, {
            rootMargin: '-40% 0px -60% 0px',
            threshold: 0
        });
        sections.forEach(section => sectionObserver.observe(section));

        if (dom.scrollToTop && dom.progressRing) {
            const radius = dom.progressRing.r.baseVal.value;
            const circumference = radius * 2 * Math.PI;
            dom.progressRing.style.strokeDasharray = `${circumference} ${circumference}`;
            dom.progressRing.style.strokeDashoffset = circumference;
            const updateScrollProgress = () => {
                const scrollTop = window.scrollY || document.documentElement.scrollTop;
                const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                const scrollPercent = docHeight > 0 ? scrollTop / docHeight : 0;
                const offset = circumference - scrollPercent * circumference;
                dom.progressRing.style.strokeDashoffset = isNaN(offset) ? circumference : offset;
                dom.scrollToTop.classList.toggle('show', scrollTop > 300);
            };
            window.addEventListener('scroll', updateScrollProgress, {
                passive: true
            });
            dom.scrollToTop.addEventListener('click', () => window.scrollTo({
                top: 0,
                behavior: 'smooth'
            }));
        }
    }

    function updateRevealObserver() {
        const revealElements = document.querySelectorAll('.reveal-on-scroll');
        if (revealObserver) revealElements.forEach(el => {
            el.classList.remove('is-visible');
            el.querySelectorAll('.stat-number').forEach(num => num.removeAttribute('data-animated'));
            revealObserver.observe(el);
        });
    }

    function animateNumber(el) {
        const target = parseFloat(el.dataset.target);
        if (isNaN(target)) return;
        const isFloat = target % 1 !== 0;
        let current = 0;
        const duration = 1500;
        const stepTime = 20;
        const steps = duration / stepTime;
        const increment = target / steps;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                el.textContent = isFloat ? target.toFixed(1) : new Intl.NumberFormat('en-US').format(target);
                clearInterval(timer);
            } else {
                el.textContent = isFloat ? current.toFixed(1) : new Intl.NumberFormat('en-US').format(Math.ceil(current));
            }
        }, stepTime);
    }

    function initHeroAnimation() {
        if (!dom.heroBg) return;
        const orbs = [{
            color: 'rgba(48, 129, 247, 0.3)',
            size: 400,
            x1: '10vw',
            y1: '20vh',
            x2: '80vw',
            y2: '70vh',
            duration: '20s'
        }, {
            color: 'rgba(236, 72, 153, 0.3)',
            size: 500,
            x1: '90vw',
            y1: '10vh',
            x2: '20vw',
            y2: '80vh',
            duration: '25s'
        }, {
            color: 'rgba(139, 92, 246, 0.2)',
            size: 300,
            x1: '50vw',
            y1: '90vh',
            x2: '40vw',
            y2: '10vh',
            duration: '30s'
        }];
        dom.heroBg.innerHTML = '';
        orbs.forEach(orbData => {
            const orb = document.createElement('div');
            orb.className = 'aurora-orb';
            Object.assign(orb.style, {
                width: `${orbData.size}px`,
                height: `${orbData.size}px`,
                backgroundColor: orbData.color,
                animation: `move-orb ${orbData.duration} alternate infinite ease-in-out`
            });
            orb.style.setProperty('--x-start', orbData.x1);
            orb.style.setProperty('--y-start', orbData.y1);
            orb.style.setProperty('--x-end', orbData.x2);
            orb.style.setProperty('--y-end', orbData.y2);
            dom.heroBg.appendChild(orb);
        });
    }

    function initMobileMenu() {
        if (!dom.mobileMenuButton || !dom.mobileMenu) return;
        const toggleMenu = () => {
            const isHidden = dom.mobileMenu.classList.toggle('hidden');
            dom.body.classList.toggle('menu-open', !isHidden);
        };
        dom.mobileMenuButton.addEventListener('click', toggleMenu);
        dom.mobileMenu.addEventListener('click', (e) => {
            if (e.target.matches('a.mobile-menu-link') || e.target.closest('a.mobile-menu-link')) {
                toggleMenu();
            }
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 768) {
                ModalManager.closeMobileMenu();
            }
        });
    }

    function injectCsrfToken(form) {
        if (!form || !SITE_DATA.csrfToken) return;
        let tokenInput = form.querySelector('input[name="csrf_token"]');
        if (tokenInput) {
            tokenInput.value = SITE_DATA.csrfToken;
        } else {
            tokenInput = document.createElement('input');
            tokenInput.type = 'hidden';
            tokenInput.name = 'csrf_token';
            tokenInput.value = SITE_DATA.csrfToken;
            form.prepend(tokenInput);
        }
    }

    async function handleFormSubmit(form) {
        const button = form.querySelector('button[type="submit"]');
        const originalButtonHTML = button.innerHTML;
        const statusView = form.querySelector('.status-message-area');
        const lang = currentLang || 'en';

        if (statusView) statusView.innerHTML = '';
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

        try {
            const sendingMessage = SITE_DATA.translations[lang] ? .form_status_sending || 'Sending...';
            if (statusView) statusView.innerHTML = `<p class="text-yellow-400">${sendingMessage}</p>`;

            injectCsrfToken(form);
            const formData = new FormData(form);

            if (form.id === 'subscription-form' && formData.get('dob')) {
                const [year, month, day] = formData.get('dob').split('-');
                formData.set('dob', `${day}/${month}/${year}`);
            }

            const response = await fetch(CONFIG.mailerURL, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            await getCsrfToken();

            if (!response.ok) {
                throw new Error(result.message || `Server error: ${response.status}.`);
            }

            if (result.status === 'success') {
                const successMessage = SITE_DATA.translations[lang] ? .form_status_success || 'Message sent successfully!';
                form.reset();

                if (form.id === 'subscription-form') {
                    ModalManager.close(dom.subscriptionModal);
                    ModalManager.open(dom.formSuccessModal);
                } else {
                    if (statusView) statusView.innerHTML = `<p class="text-green-400">${successMessage}</p>`;
                    setTimeout(() => {
                        if (statusView) statusView.innerHTML = '';
                    }, 5000);
                }
            } else {
                throw new Error(result.message || (SITE_DATA.translations[lang] ? .form_status_error_generic || 'An unknown error occurred.'));
            }
        } catch (error) {
            const errorMessage = error.message || (SITE_DATA.translations[lang] ? .form_status_error_generic || 'An unknown error occurred.');
            if (statusView) statusView.innerHTML = `<p class="text-red-400">${errorMessage}</p>`;
        } finally {
            button.innerHTML = originalButtonHTML;
            if (form.id === 'subscription-form') {
                dom.submitRequestBtn.disabled = !dom.termsAgree.checked;
            } else {
                button.disabled = false;
            }
        }
    }

    function initSubscriptionFlow() {
        document.body.addEventListener('click', (e) => {
            const ctaButton = e.target.closest('.package-cta-btn');
            if (ctaButton) {
                const packageName = ctaButton.dataset.packageName;
                const lang = currentLang || 'en';
                dom.selectedPackageText.textContent = `${SITE_DATA.translations[lang]?.selected_package_text || 'Selected Plan:'} ${packageName}`;
                dom.hiddenPackageName.value = packageName;

                if (dom.subscriptionForm) {
                    dom.subscriptionForm.reset();
                    if (dom.submitRequestBtn) dom.submitRequestBtn.disabled = true;
                    if (dom.termsAgree) dom.termsAgree.checked = false;
                    const statusView = dom.subscriptionForm.querySelector('.status-message-area');
                    if (statusView) statusView.innerHTML = '';
                }
                ModalManager.open(dom.subscriptionModal);
            }
        });

        if (dom.termsAgree) dom.termsAgree.addEventListener('change', () => {
            dom.submitRequestBtn.disabled = !dom.termsAgree.checked;
        });

        if (dom.dob) {
            const today = new Date().toISOString().split('T')[0];
            dom.dob.setAttribute('max', today);
        }

        if (dom.subscriptionForm) dom.subscriptionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleFormSubmit(dom.subscriptionForm);
        });
    }

    function initContactForm() {
        if (!dom.contactForm) return;
        dom.contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleFormSubmit(dom.contactForm);
        });
    }

    function initEventListeners() {
        if (dom.checkCoverageBtn) dom.checkCoverageBtn.addEventListener('click', handleCoverageCheck);
    }

    // --- SCRIPT INITIALIZATION ---
    async function initializeApp() {
        try {
            await getCsrfToken();
            await fetchAllData();

            if (!SITE_DATA || !SITE_DATA.translations || !SITE_DATA.translations['en']) {
                throw new Error("Essential site data (translations.json) could not be loaded.");
            }

            ThemeManager.init();
            LanguageManager.init();
            ModalManager.init();

            initScrollFeatures();
            initHeroAnimation();
            initSpeedTest();
            initMobileMenu();
            initEventListeners();
            initSubscriptionFlow();
            initContactForm();

        } catch (error) {
            console.error("Critical site initialization error:", error);
            document.body.innerHTML = `<div style="padding:2rem;text-align:center;color:white;background-color:#0D1117;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;"><h1>Site Initialization Failed</h1><p>Please check the browser console (F12) for details.</p><p style="color:#8D96A0;margin-top:1rem;">${error.message}</p></div>`;
        }
    }

    initializeApp();
});