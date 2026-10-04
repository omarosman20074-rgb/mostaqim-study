(function () {
    const config = window.SUPABASE_CONFIG || {};
    const bucketName = 'pdf-files';
    let client = null;
    let statusTimer = null;
    let currentUserId = null;
    let isAdmin = false;
    let handlingUserId = null;
    let currentUserEmail = '';

    const byId = id => document.getElementById(id);
    const setMessage = (element, text, kind = 'info') => {
        element.textContent = text;
        element.dataset.kind = kind;
        element.classList.remove('hidden');
    };

    function setGateState(message, kind = 'info') {
        const state = byId('accessState');
        if (state) setMessage(state, message, kind);
    }

    function openLogin(message, kind = 'info') {
        const gate = byId('accessGate');
        if (gate) {
            gate.classList.remove('hidden');
            gate.style.display = 'flex';
        }
        byId('accessForm')?.classList.toggle('hidden', Boolean(currentUserId));
        byId('accessSessionActions')?.classList.toggle('hidden', !currentUserId);
        if (message) setGateState(message, kind);
    }

    function closeLogin() {
        const gate = byId('accessGate');
        if (gate) {
            gate.classList.add('hidden');
            gate.style.display = 'none';
        }
    }

    // الموقع مفتوح للجميع: المحتوى ظاهر دائمًا، وتسجيل الدخول اختياري (للمشرفين وللتعرّف على الزوار).
    function showSite() {
        document.body.classList.add('site-access-granted');
        document.querySelectorAll('[data-protected-content]').forEach(element => { element.hidden = false; });
        closeLogin();
    }

    function showSignedOutState() {
        isAdmin = false;
        currentUserId = null;
        currentUserEmail = '';
        showSite();
        byId('adminAccessButton')?.classList.add('hidden');
        byId('adminAccessPanel')?.classList.add('hidden');
        byId('siteSignOutButton')?.classList.add('hidden');
        byId('siteSignInButton')?.classList.remove('hidden');
    }

    function grantSiteAccess(admin) {
        showSite();
        byId('adminAccessButton')?.classList.toggle('hidden', !admin);
        byId('siteSignOutButton')?.classList.remove('hidden');
        byId('siteSignInButton')?.classList.add('hidden');
        byId('accessSessionActions')?.classList.add('hidden');
        isAdmin = admin;
    }

    function setupLoginUi() {
        const gate = byId('accessGate');
        const card = gate?.querySelector('.access-card');
        if (card && !byId('closeAccessGate')) {
            const close = document.createElement('button');
            close.id = 'closeAccessGate';
            close.type = 'button';
            close.className = 'text-sm text-slate-400 hover:text-white';
            close.textContent = 'رجوع للموقع';
            close.addEventListener('click', closeLogin);
            card.appendChild(close);
        }
        const themeToggle = byId('themeToggle');
        if (themeToggle && !byId('siteSignInButton')) {
            const button = document.createElement('button');
            button.id = 'siteSignInButton';
            button.type = 'button';
            button.className = 'rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:text-white transition';
            button.textContent = 'تسجيل الدخول';
            button.addEventListener('click', () => openLogin('اكتب بريدك الإلكتروني لتسجيل الدخول.'));
            themeToggle.insertAdjacentElement('beforebegin', button);
        }
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeLogin();
        });
    }

    async function requestAdminStatus(userId) {
        const { data, error } = await client.from('site_admins').select('user_id').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        return Boolean(data);
    }

    async function getAccessRequest(userId) {
        const { data, error } = await client.from('site_access_requests').select('id, status').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        return data;
    }

    async function sendOwnerNotification() {
        try {
            const { error } = await client.functions.invoke('notify-access-request');
            if (error) console.warn('Access request was saved, but its email notification could not be sent.', error);
        } catch (error) {
            console.warn('Access request was saved, but its email notification could not be sent.', error);
        }
    }

    async function handleSession(session) {
        const user = session?.user;
        if (user && handlingUserId === user.id) return;
        if (!user) {
            showSignedOutState();
            return;
        }
        handlingUserId = user.id;
        try {
            await processUserSession(user);
        } finally {
            handlingUserId = null;
        }
    }

    async function processUserSession(user) {
        currentUserId = user.id;
        currentUserEmail = user.email || '';
        byId('accessForm')?.classList.add('hidden');
        byId('accessSessionActions')?.classList.remove('hidden');
        if (byId('accessAccountEmail')) byId('accessAccountEmail').textContent = user.email || '';

        try {
            const admin = await requestAdminStatus(user.id);
            grantSiteAccess(admin);
            if (admin) {
                loadAccessRequests();
                return;
            }
            // نسجّل الزائر المسجّل دخوله ليظهر في لوحة المشرفين (من غير ما يتعطّل دخوله لو فشل التسجيل).
            const accessRequest = await getAccessRequest(user.id);
            if (!accessRequest) {
                const { error } = await client.from('site_access_requests').insert({ user_id: user.id, email: user.email, status: 'pending' });
                if (error && error.code !== '23505') throw error;
                if (!error) await sendOwnerNotification();
            }
        } catch (error) {
            console.error(error);
            showSite();
            byId('siteSignOutButton')?.classList.remove('hidden');
            byId('siteSignInButton')?.classList.add('hidden');
        }
    }

    async function loadAccessRequests() {
        const container = byId('adminAccessRequests');
        if (!container || !client || !isAdmin) return;
        container.replaceChildren();
        const { data, error } = await client
            .from('site_access_requests')
            .select('id, email, status, requested_at')
            .order('requested_at', { ascending: false });

        if (error) {
            setMessage(container, 'تعذر تحميل الطلبات. تحقق من سياسات قاعدة البيانات.', 'error');
            return;
        }
        if (!data.length) {
            setMessage(container, 'لا توجد طلبات دخول حتى الآن.');
            return;
        }

        data.forEach(request => {
            const row = document.createElement('div');
            row.className = 'access-request-row';
            const details = document.createElement('div');
            const email = document.createElement('strong');
            email.textContent = request.email;
            const status = document.createElement('span');
            status.textContent = `${request.status} · ${new Date(request.requested_at).toLocaleDateString('ar-EG')}`;
            details.append(email, status);
            const actions = document.createElement('div');
            actions.className = 'access-request-actions';

            const addAction = (label, decision, style) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = label;
                button.className = style;
                button.onclick = () => reviewRequest(request.id, decision);
                actions.appendChild(button);
            };

            if (request.status === 'pending') {
                addAction('موافقة', 'approved', 'access-approve');
                addAction('رفض', 'denied', 'access-reject');
            } else if (request.status === 'approved') {
                addAction('سحب الوصول', 'revoked', 'access-reject');
            } else if (request.status === 'denied' || request.status === 'revoked') {
                addAction('إعادة للمراجعة', 'pending', 'access-neutral');
            }

            row.append(details, actions);
            container.appendChild(row);
        });
    }

    /* ---------- إدارة المشرفين (للمالك الرئيسي فقط) ---------- */
    function isOwner() {
        return Boolean(isAdmin && currentUserEmail && config.ownerEmail &&
            currentUserEmail.toLowerCase() === String(config.ownerEmail).toLowerCase());
    }

    function adminErrorText(error) {
        const message = String(error?.message || '');
        if (message.includes('user_not_found')) return 'مفيش حساب بالإيميل ده. لازم الشخص يفتح الموقع ويسجّل دخول بإيميله مرة واحدة الأول.';
        if (message.includes('not_owner')) return 'الصلاحية دي للمالك الرئيسي بس.';
        if (message.includes('cannot_remove_owner')) return 'مينفعش تشيل المالك الرئيسي.';
        if (message.includes('Could not find the function')) return 'لسه ما شغّلتش ملف SQL الخاص بالمشرفين في Supabase.';
        return 'حصل خطأ: ' + message;
    }

    function renderAdminManager() {
        const panel = byId('adminAccessPanel');
        if (!panel || !client || !isOwner()) return;
        if (byId('adminManager')) {
            loadAdmins();
            return;
        }

        const box = document.createElement('div');
        box.id = 'adminManager';
        box.className = 'mt-6 space-y-3 border-t border-slate-700 pt-4';

        const title = document.createElement('h3');
        title.className = 'font-bold text-white';
        title.textContent = 'المشرفون';
        const hint = document.createElement('p');
        hint.className = 'text-xs text-slate-400';
        hint.textContent = 'اكتب إيميل شخص سبق وسجّل دخول للموقع لتعيينه مشرفًا. أنت المالك الرئيسي ولا يمكن إزالتك.';

        const row = document.createElement('div');
        row.className = 'flex flex-wrap gap-2';
        const input = document.createElement('input');
        input.id = 'newAdminEmail';
        input.type = 'email';
        input.dir = 'ltr';
        input.placeholder = 'name@example.com';
        input.className = 'access-input flex-1';
        input.style.minWidth = '12rem';
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'access-approve rounded-xl px-4 py-2 text-sm font-bold';
        addButton.textContent = 'تعيين كمشرف';
        row.append(input, addButton);

        const status = document.createElement('p');
        status.id = 'adminManagerStatus';
        status.className = 'access-state text-sm hidden';
        status.setAttribute('role', 'status');

        const list = document.createElement('div');
        list.id = 'adminManagerList';
        list.className = 'divide-y divide-slate-700';

        box.append(title, hint, row, status, list);
        panel.appendChild(box);

        addButton.addEventListener('click', async () => {
            const email = input.value.trim().toLowerCase();
            if (!email) {
                setMessage(status, 'اكتب الإيميل الأول.', 'error');
                return;
            }
            addButton.disabled = true;
            setMessage(status, 'جارٍ التعيين...');
            const { error } = await client.rpc('add_site_admin', { admin_email: email });
            addButton.disabled = false;
            if (error) {
                console.error(error);
                setMessage(status, adminErrorText(error), 'error');
                return;
            }
            input.value = '';
            setMessage(status, 'تم تعيين المشرف.');
            loadAdmins();
            loadAccessRequests();
        });

        loadAdmins();
    }

    async function loadAdmins() {
        const list = byId('adminManagerList');
        const status = byId('adminManagerStatus');
        if (!list || !client || !isOwner()) return;
        list.replaceChildren();
        const { data, error } = await client.rpc('list_site_admins');
        if (error) {
            console.error(error);
            setMessage(list, adminErrorText(error), 'error');
            return;
        }
        (data || []).forEach(admin => {
            const row = document.createElement('div');
            row.className = 'access-request-row';
            const details = document.createElement('div');
            const email = document.createElement('strong');
            email.dir = 'ltr';
            email.textContent = admin.mail || admin.uid;
            details.appendChild(email);
            const isMain = String(admin.mail || '').toLowerCase() === String(config.ownerEmail).toLowerCase();
            const tag = document.createElement('span');
            tag.textContent = isMain ? 'المالك الرئيسي' : 'مشرف';
            details.appendChild(tag);
            row.appendChild(details);
            if (!isMain) {
                const actions = document.createElement('div');
                actions.className = 'access-request-actions';
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'access-reject';
                remove.textContent = 'إزالة الإشراف';
                remove.onclick = async () => {
                    if (!window.confirm('إزالة صلاحية الإشراف عن ' + admin.mail + '؟')) return;
                    const { error: removeError } = await client.rpc('remove_site_admin', { admin_email: admin.mail });
                    if (removeError) {
                        console.error(removeError);
                        if (status) setMessage(status, adminErrorText(removeError), 'error');
                        return;
                    }
                    loadAdmins();
                };
                actions.appendChild(remove);
                row.appendChild(actions);
            }
            list.appendChild(row);
        });
    }

    async function reviewRequest(requestId, decision) {
        const { error } = await client.rpc('review_site_access', { request_id: requestId, decision });
        if (error) {
            setMessage(byId('adminAccessStatus'), 'تعذر حفظ القرار. تحقق من صلاحية المسؤول.', 'error');
            return;
        }
        byId('adminAccessStatus').classList.add('hidden');
        await loadAccessRequests();
    }

    let cooldownTimer = null;

    function startSendCooldown(button, seconds) {
        clearInterval(cooldownTimer);
        let remaining = seconds;
        const label = button.dataset.label || button.textContent;
        button.dataset.label = label;
        button.disabled = true;
        const tick = () => {
            if (remaining <= 0) {
                clearInterval(cooldownTimer);
                button.disabled = false;
                button.textContent = label;
                return;
            }
            button.textContent = `إعادة الإرسال بعد ${remaining} ثانية`;
            remaining -= 1;
        };
        tick();
        cooldownTimer = setInterval(tick, 1000);
    }

    async function submitEmailRequest(event) {
        event.preventDefault();
        if (!client) return;
        const button = byId('sendAccessLink');
        if (button.disabled) return;
        const email = byId('accessEmail').value.trim();
        button.disabled = true;
        setGateState('بنرسل رابط التحقق لبريدك...');
        const { error } = await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` }
        });
        if (error) {
            console.error('signInWithOtp failed:', error);
            const reason = String(error.message || '').toLowerCase();
            if (error.status === 429 || reason.includes('rate limit') || reason.includes('seconds')) {
                startSendCooldown(button, 60);
                setGateState('طلبت الرابط قبل لحظات. استنى دقيقة وافتح بريدك (شوف كمان الـ Spam) قبل ما تطلب تاني.', 'error');
                return;
            }
            button.disabled = false;
            let hint = 'حاول مرة أخرى بعد قليل.';
            if (reason.includes('not authorized')) hint = 'خدمة البريد في Supabase مش مفعّل فيها SMTP مخصص، فبتبعت لأعضاء المشروع بس.';
            else if (reason.includes('smtp') || reason.includes('sending') || reason.includes('error sending')) hint = 'إعدادات SMTP في Supabase فيها مشكلة (المستخدم أو كلمة مرور التطبيق أو المنفذ).';
            else if (reason.includes('redirect')) hint = 'رابط الموقع غير مضاف في Redirect URLs داخل Supabase.';
            setGateState(`تعذر إرسال الرابط. ${hint}`, 'error');
            return;
        }
        startSendCooldown(button, 60);
        setGateState('افتح بريدك واضغط رابط التحقق لإتمام تسجيل الدخول. لو مفيش رسالة شوف الـ Spam.');
    }

    async function initialize() {
        setupLoginUi();
        showSignedOutState();
        const form = byId('accessForm');
        form?.addEventListener('submit', submitEmailRequest);
        byId('refreshAccessButton')?.addEventListener('click', () => client?.auth.getSession().then(({ data }) => handleSession(data.session)));
        byId('signOutButton')?.addEventListener('click', async () => {
            await client?.auth.signOut();
            showSignedOutState();
        });
        byId('siteSignOutButton')?.addEventListener('click', async () => {
            await client?.auth.signOut();
            showSignedOutState();
        });
        byId('adminAccessButton')?.addEventListener('click', () => {
            const panel = byId('adminAccessPanel');
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                loadAccessRequests();
                renderAdminManager();
            }
        });
        byId('refreshRequestsButton')?.addEventListener('click', loadAccessRequests);

        if (!config.url || !config.anonKey || config.url.includes('YOUR_') || config.anonKey.includes('YOUR_')) {
            console.error('Supabase config is missing.');
            return;
        }

        if (!window.supabase?.createClient) {
            console.error('Supabase library failed to load.');
            return;
        }

        client = window.supabase.createClient(config.url, config.anonKey, {
            auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
        });
        window.siteSupabase = client;
        const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
                queueMicrotask(() => handleSession(session));
            }
        });
        window.siteAuthSubscription = subscription;
        const { data: { session } } = await client.auth.getSession();
        await handleSession(session);
    }

    function getStoragePath(filePath) {
        return decodeURIComponent(filePath).replace(/^publish-ready\//, '').replace(/^\/+/, '');
    }

    window.isSiteAdmin = () => isAdmin;

    window.loadLessonTextOverride = async function (filePath, pageNumber) {
        if (!client || !document.body.classList.contains('site-access-granted')) throw new Error('لازم تسجّل الدخول لقراءة المحتوى.');
        const { data, error } = await client
            .from('lesson_text_overrides')
            .select('text_content, highlights')
            .eq('storage_path', getStoragePath(filePath))
            .eq('page_number', pageNumber)
            .maybeSingle();
        if (error) throw error;
        return data ? { text: data.text_content, highlights: data.highlights || [] } : null;
    };

    window.saveLessonTextOverride = async function (filePath, pageNumber, textContent, highlights) {
        if (!client || !isAdmin) throw new Error('التعديل متاح لمسؤول الموقع فقط.');
        const { error } = await client
            .from('lesson_text_overrides')
            .upsert({
                storage_path: getStoragePath(filePath),
                page_number: pageNumber,
                text_content: textContent,
                highlights: Array.isArray(highlights) ? highlights : [],
                updated_by: currentUserId,
                updated_at: new Date().toISOString()
            }, { onConflict: 'storage_path,page_number' });
        if (error) throw error;
    };

    window.loadProtectedPdf = async function (filePath) {
        if (!client || !document.body.classList.contains('site-access-granted')) throw new Error('لازم تسجّل الدخول بحساب مصرح به لفتح المحتوى.');
        const storagePath = getStoragePath(filePath);
        const { data, error } = await client.storage.from(bucketName).download(storagePath);
        if (error) throw error;
        return new Uint8Array(await data.arrayBuffer());
    };

    window.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
