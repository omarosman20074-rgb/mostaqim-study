
Site auth · JS
(function () {
    const config = window.SUPABASE_CONFIG || {};
    const bucketName = 'pdf-files';
    let client = null;
    let statusTimer = null;
    let currentUserId = null;
    let isAdmin = false;
    let handlingUserId = null;
 
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
 
    function showGate(message, kind = 'info') {
        document.body.classList.remove('site-access-granted');
        isAdmin = false;
        document.querySelectorAll('[data-protected-content]').forEach(element => { element.hidden = true; });
        byId('accessGate')?.classList.remove('hidden');
        byId('adminAccessButton')?.classList.add('hidden');
        byId('adminAccessPanel')?.classList.add('hidden');
        byId('accessForm')?.classList.remove('hidden');
        byId('accessSessionActions')?.classList.add('hidden');
        byId('siteSignOutButton')?.classList.add('hidden');
        setGateState(message, kind);
    }
 
    function grantSiteAccess(admin) {
        document.body.classList.add('site-access-granted');
        document.querySelectorAll('[data-protected-content]').forEach(element => { element.hidden = false; });
        byId('accessGate')?.classList.add('hidden');
        byId('adminAccessButton')?.classList.toggle('hidden', !admin);
        byId('siteSignOutButton')?.classList.remove('hidden');
        byId('accessSessionActions')?.classList.add('hidden');
        isAdmin = admin;
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
        clearInterval(statusTimer);
        if (!user) {
            currentUserId = null;
            showGate('سجّل بريدك الإلكتروني لطلب السماح بالدخول.');
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
        byId('accessForm')?.classList.add('hidden');
        byId('accessSessionActions')?.classList.remove('hidden');
        if (byId('accessAccountEmail')) byId('accessAccountEmail').textContent = user.email || '';
        setGateState('نتحقق من حالة طلب الدخول...');
 
        try {
            const admin = await requestAdminStatus(user.id);
            const accessRequest = await getAccessRequest(user.id);
            if (admin || accessRequest?.status === 'approved') {
                grantSiteAccess(admin);
                if (admin) loadAccessRequests();
                statusTimer = setInterval(() => refreshAccessStatus(user.id), 30000);
                return;
            }
 
            if (!accessRequest) {
                const { error } = await client.from('site_access_requests').insert({ user_id: user.id, email: user.email, status: 'pending' });
                if (error && error.code !== '23505') throw error;
                if (!error) await sendOwnerNotification();
                setGateState('تم إرسال طلبك، وهيوصلك إشعار بعد قرار المسؤول.');
                return;
            }
 
            if (accessRequest.status === 'pending') {
                setGateState('طلبك قيد المراجعة. هتقدر تدخل بعد موافقة المسؤول.');
            } else if (accessRequest.status === 'denied') {
                setGateState('تم رفض طلب الدخول. تواصل مع المسؤول لو محتاج إعادة المراجعة.', 'error');
            } else {
                setGateState('تم إيقاف صلاحية الدخول لهذا الحساب.', 'error');
            }
        } catch (error) {
            console.error(error);
            showGate('تعذر التحقق من صلاحية الحساب. راجع إعداد Supabase والسياسات، ثم أعد المحاولة.', 'error');
        }
    }
 
    async function refreshAccessStatus(userId) {
        if (!client || currentUserId !== userId) return;
        try {
            const admin = await requestAdminStatus(userId);
            const request = await getAccessRequest(userId);
            if (!admin && request?.status !== 'approved') {
                clearInterval(statusTimer);
                await client.auth.signOut();
                showGate(request?.status === 'revoked' ? 'تم إيقاف صلاحية الدخول لهذا الحساب.' : 'لم يعد هذا الحساب مصرحًا له بالدخول.', 'error');
            }
        } catch (error) {
            console.warn('Could not refresh site access status.', error);
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
 
    async function reviewRequest(requestId, decision) {
        const { error } = await client.rpc('review_site_access', { request_id: requestId, decision });
        if (error) {
            setMessage(byId('adminAccessStatus'), 'تعذر حفظ القرار. تحقق من صلاحية المسؤول.', 'error');
            return;
        }
        byId('adminAccessStatus').classList.add('hidden');
        await loadAccessRequests();
    }
 
    async function submitEmailRequest(event) {
        event.preventDefault();
        if (!client) return;
        const email = byId('accessEmail').value.trim();
        const button = byId('sendAccessLink');
        button.disabled = true;
        setGateState('بنرسل رابط التحقق لبريدك...');
        const { error } = await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` }
        });
        button.disabled = false;
        if (error) {
            console.error('signInWithOtp failed:', error);
            const reason = String(error.message || '').toLowerCase();
            let hint = 'حاول مرة أخرى بعد قليل.';
            if (reason.includes('not authorized')) hint = 'خدمة البريد في Supabase مش مفعّل فيها SMTP مخصص، فبتبعت لأعضاء المشروع بس.';
            else if (reason.includes('rate limit') || error.status === 429) hint = 'عدد الرسائل في الساعة وصل للحد الأقصى. استنى شوية أو ارفع الحد من Rate Limits.';
            else if (reason.includes('smtp') || reason.includes('sending') || reason.includes('error sending')) hint = 'إعدادات SMTP في Supabase فيها مشكلة (المستخدم أو كلمة مرور التطبيق أو المنفذ).';
            else if (reason.includes('redirect')) hint = 'رابط الموقع غير مضاف في Redirect URLs داخل Supabase.';
            setGateState(`تعذر إرسال الرابط. ${hint}`, 'error');
            return;
        }
        setGateState('افتح بريدك واضغط رابط التحقق للمتابعة وطلب الموافقة.');
    }
 
    async function initialize() {
        const form = byId('accessForm');
        form?.addEventListener('submit', submitEmailRequest);
        byId('refreshAccessButton')?.addEventListener('click', () => client?.auth.getSession().then(({ data }) => handleSession(data.session)));
        byId('signOutButton')?.addEventListener('click', async () => {
            await client?.auth.signOut();
            showGate('تم تسجيل الخروج.');
        });
        byId('siteSignOutButton')?.addEventListener('click', async () => {
            await client?.auth.signOut();
            showGate('تم تسجيل الخروج.');
        });
        byId('adminAccessButton')?.addEventListener('click', () => {
            const panel = byId('adminAccessPanel');
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) loadAccessRequests();
        });
        byId('refreshRequestsButton')?.addEventListener('click', loadAccessRequests);
 
        if (!config.url || !config.anonKey || config.url.includes('YOUR_') || config.anonKey.includes('YOUR_')) {
            showGate('الموقع خاص، لكنه يحتاج إعداد مشروع Supabase قبل تفعيل الدخول. راجع ملف إعداد الوصول المرفق.');
            return;
        }
 
        if (!window.supabase?.createClient) {
            showGate('تعذر تحميل خدمة تسجيل الدخول. تحقق من اتصال الإنترنت ثم أعد المحاولة.', 'error');
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
 
