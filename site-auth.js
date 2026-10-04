(function () {
    const config = window.SUPABASE_CONFIG || {};
    const bucketName = 'pdf-files';
    let client = null;
    let statusTimer = null;
    let currentUserId = null;
    let isAdmin = false;

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
        if (admin) {
            renderDirectAddForm();
        }
    }

    async function requestAdminStatus(userId, email) {
        // التحقق عبر إيميل المالك المعرف في الكونفج أو جدول الأدمنة
        if (config.ownerEmail && email && config.ownerEmail.toLowerCase() === email.toLowerCase()) {
            return true;
        }
        const { data, error } = await client.from('site_admins').select('user_id').eq('user_id', userId).maybeSingle();
        if (error) return false;
        return Boolean(data);
    }

    async function getAccessRequest(userId) {
        const { data, error } = await client.from('site_access_requests').select('id, status').eq('user_id', userId).maybeSingle();
        if (error) return null;
        return data;
    }

    async function sendOwnerNotification() {
        try {
            await client.functions.invoke('notify-access-request');
        } catch (error) {
            console.warn('Notification warning:', error);
        }
    }

    async function handleSession(session) {
        clearInterval(statusTimer);
        const user = session?.user;
        if (!user) {
            currentUserId = null;
            showGate('سجّل بريدك الإلكتروني لطلب السماح بالدخول.');
            return;
        }

        currentUserId = user.id;
        byId('accessForm')?.classList.add('hidden');
        byId('accessSessionActions')?.classList.remove('hidden');
        if (byId('accessAccountEmail')) byId('accessAccountEmail').textContent = user.email || '';
        setGateState('نتحقق من حالة طلب الدخول...');

        try {
            const admin = await requestAdminStatus(user.id, user.email);
            const accessRequest = await getAccessRequest(user.id);
            if (admin || accessRequest?.status === 'approved') {
                grantSiteAccess(admin);
                if (admin) loadAccessRequests();
                statusTimer = setInterval(() => refreshAccessStatus(user.id, user.email), 30000);
                return;
            }

            if (!accessRequest) {
                const { error } = await client.from('site_access_requests').insert({ user_id: user.id, email: user.email, status: 'pending' });
                if (error && error.code !== '23505') throw error;
                await sendOwnerNotification();
                setGateState('تم إرسال طلبك، وهيوصلك إشعار بعد قرار المسؤول.');
                return;
            }

            if (accessRequest.status === 'pending') {
                setGateState('طلبك قيد المراجعة. هتقدر تدخل بعد موافقة المسؤول.');
            } else if (accessRequest.status === 'denied') {
                setGateState('تم رفض طلب الدخول.', 'error');
            } else {
                setGateState('تم إيقاف صلاحية الدخول لهذا الحساب.', 'error');
            }
        } catch (error) {
            console.error(error);
            showGate('تعذر التحقق من صلاحية الحساب.', 'error');
        }
    }

    async function refreshAccessStatus(userId, userEmail) {
        if (!client || currentUserId !== userId) return;
        try {
            const admin = await requestAdminStatus(userId, userEmail);
            const request = await getAccessRequest(userId);
            if (!admin && request?.status !== 'approved') {
                clearInterval(statusTimer);
                await client.auth.signOut();
                showGate('لم يعد هذا الحساب مصرحًا له بالدخول.', 'error');
            }
        } catch (error) {
            console.warn('Refresh error:', error);
        }
    }

    // دالة إنشاء واجهة الإضافة السريعة للإيميلات داخل لوحة الأدمن
    function renderDirectAddForm() {
        const panel = byId('adminAccessPanel');
        if (!panel || byId('directAddFormContainer')) return;

        const container = document.createElement('div');
        container.id = 'directAddFormContainer';
        container.className = 'mb-4 pb-4 border-b border-slate-700 space-y-3';
        container.innerHTML = `
            <h3 class="text-sm font-bold text-white">إضافة إيميل جديد مسموح له بالدخول فورا</h3>
            <div class="flex gap-2">
                <input type="email" id="quickEmailInput" placeholder="example@gmail.com" class="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" />
                <button id="quickAddBtn" type="button" class="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500 transition">إضافة وسماح</button>
            </div>
            <p id="quickAddStatus" class="text-xs font-semibold"></p>
        `;

        panel.insertBefore(container, panel.firstChild);

        byId('quickAddBtn').onclick = async () => {
            const input = byId('quickEmailInput');
            const statusEl = byId('quickAddStatus');
            const emailToAdd = input.value.trim().toLowerCase();

            if (!emailToAdd) {
                statusEl.textContent = 'الرجاء كتابة البريد الإلكتروني أولاً.';
                statusEl.style.color = '#fca5a5';
                return;
            }

            statusEl.textContent = 'جاري الحفظ في قاعدة البيانات...';
            statusEl.style.color = '#cbd5e1';

            const { error } = await client
                .from('site_access_requests')
                .upsert([{ email: emailToAdd, status: 'approved' }], { onConflict: ['email'] });

            if (error) {
                statusEl.textContent = 'حدث خطأ: ' + error.message;
                statusEl.style.color = '#fca5a5';
            } else {
                statusEl.textContent = 'تمت إضافة البريد وتفعيله بنجاح!';
                statusEl.style.color = '#86efac';
                input.value = '';
                loadAccessRequests();
            }
        };
    }

    async function loadAccessRequests() {
        const container = byId('adminAccessRequests');
        if (!container || !client || !isAdmin) return;
        const { data, error } = await client
            .from('site_access_requests')
            .select('id, email, status, requested_at')
            .order('requested_at', { ascending: false });

        if (error) {
            setMessage(container, 'تعذر تحميل الطلبات.', 'error');
            return;
        }
        if (!data || !data.length) {
            return;
        }

        // نحتفظ بform الإضافة السريعة ونحدث باقي الطلبات
        const directAddForm = byId('directAddFormContainer');
        container.replaceChildren();
        if (directAddForm) container.appendChild(directAddForm);

        data.forEach(request => {
            const row = document.createElement('div');
            row.className = 'access-request-row py-2 flex items-center justify-between border-b border-slate-800';
            const details = document.createElement('div');
            const email = document.createElement('strong');
            email.className = 'text-white text-sm';
            email.textContent = request.email;
            const status = document.createElement('span');
            status.className = 'text-xs text-slate-400 block';
            status.textContent = `${request.status} · ${request.requested_at ? new Date(request.requested_at).toLocaleDateString('ar-EG') : 'بدون تاريخ'}`;
            details.append(email, status);
            
            const actions = document.createElement('div');
            actions.className = 'access-request-actions flex gap-2';

            const addAction = (label, decision, style) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = label;
                button.className = style + ' px-3 py-1 rounded text-xs text-white';
                button.onclick = () => reviewRequest(request.id, decision);
                actions.appendChild(button);
            };

            if (request.status === 'pending') {
                addAction('موافقة', 'approved', 'bg-green-600 hover:bg-green-500');
                addAction('رفض', 'denied', 'bg-red-600 hover:bg-red-500');
            } else if (request.status === 'approved') {
                addAction('سحب الوصول', 'revoked', 'bg-red-600 hover:bg-red-500');
            } else {
                addAction('إعادة للمراجعة', 'pending', 'bg-slate-600 hover:bg-slate-500');
            }

            row.append(details, actions);
            container.appendChild(row);
        });
    }

    async function reviewRequest(requestId, decision) {
        const { error } = await client.rpc('review_site_access', { request_id: requestId, decision });
        if (error) {
            // محاولة بديلة للتحديث المباشر لو الدالة غير متوفرة
            await client.from('site_access_requests').update({ status: decision }).eq('id', requestId);
        }
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
            setGateState('تعذر إرسال الرابط.', 'error');
            return;
        }
        setGateState('افتح بريدك واضغط رابط التحقق للمتابعة.');
    }

    async function initialize() {
        const form = byId('accessForm');
        form?.addEventListener('submit', submitEmailRequest);
        byId('refreshAccessButton')?.addEventListener('click', () => client?.auth.getSession().then(({ data }) => handleSession(data.session)));
        byId('signOutButton')?.addEventListener('click', async () => { await client?.auth.signOut(); showGate('تم تسجيل الخروج.'); });
        byId('siteSignOutButton')?.addEventListener('click', async () => { await client?.auth.signOut(); showGate('تم تسجيل الخروج.'); });
        byId('adminAccessButton')?.addEventListener('click', () => {
            const panel = byId('adminAccessPanel');
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) loadAccessRequests();
        });
        byId('refreshRequestsButton')?.addEventListener('click', loadAccessRequests);

        if (!config.url || !config.anonKey) {
            showGate('الموقع يحتاج إعداد مشروع Supabase.');
            return;
        }

        client = window.supabase.createClient(config.url, config.anonKey, {
            auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
        });
        window.siteSupabase = client;
        
        client.auth.onAuthStateChange((event, session) => {
            if (['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) {
                queueMicrotask(() => handleSession(session));
            }
        });

        const { data: { session } } = await client.auth.getSession();
        await handleSession(session);
    }

    function getStoragePath(filePath) {
        return decodeURIComponent(filePath).replace(/^publish-ready\//, '').replace(/^\/+/, '');
    }

    window.isSiteAdmin = () => isAdmin;

    window.loadLessonTextOverride = async function (filePath, pageNumber) {
        const { data, error } = await client.from('lesson_text_overrides').select('text_content, highlights').eq('storage_path', getStoragePath(filePath)).eq('page_number', pageNumber).maybeSingle();
        if (error) return null;
        return data ? { text: data.text_content, highlights: data.highlights || [] } : null;
    };

    window.saveLessonTextOverride = async function (filePath, pageNumber, textContent, highlights) {
        if (!isAdmin) throw new Error('التعديل متاح للمسؤول فقط.');
        const { error } = await client.from('lesson_text_overrides').upsert({
            storage_path: getStoragePath(filePath), page_number: pageNumber, text_content: textContent, highlights: highlights || [], updated_by: currentUserId, updated_at: new Date().toISOString()
        }, { onConflict: 'storage_path,page_number' });
        if (error) throw error;
    };

    window.loadProtectedPdf = async function (filePath) {
        const { data, error } = await client.storage.from(bucketName).download(getStoragePath(filePath));
        if (error) throw error;
        return new Uint8Array(await data.arrayBuffer());
    };

    window.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
