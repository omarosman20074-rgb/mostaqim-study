(function () {
    const config = window.SUPABASE_CONFIG || {};
    const bucketName = 'pdf-files';
    let client = null;

    const byId = id => document.getElementById(id);

    // تفعيل الوصول العام للموقع للجميع مع التحقق من صلاحيات المالك والأدمن
    function grantPublicAccess() {
        document.body.classList.add('site-access-granted');
        document.querySelectorAll('[data-protected-content]').forEach(element => { element.hidden = false; });
        byId('accessGate')?.classList.add('hidden');
        
        // التحقق هل المستخدم الحالي هو المالك الأساسي (Super Admin)
        const userEmail = window.SUPABASE_CURRENT_USER_EMAIL || '';
        const isOwner = config.ownerEmail && userEmail.toLowerCase() === config.ownerEmail.toLowerCase();

        if (isOwner) {
            byId('adminAccessButton')?.classList.remove('hidden');
        } else {
            byId('adminAccessButton')?.classList.add('hidden');
            byId('adminAccessPanel')?.classList.add('hidden');
        }
    }

    async function initialize() {
        if (!config.url || !config.anonKey || config.url.includes('YOUR_')) {
            grantPublicAccess();
            return;
        }

        if (window.supabase?.createClient) {
            client = window.supabase.createClient(config.url, config.anonKey, {
                auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
            });
            window.siteSupabase = client;

            // جلب بيانات الجلسة الحالية لمعرفة الإيميل المسجل
            try {
                const { data: { session } } = await client.auth.getSession();
                if (session?.user?.email) {
                    window.SUPABASE_CURRENT_USER_EMAIL = session.user.email;
                }
            } catch (e) {}
        }

        grantPublicAccess();
        setupSuperAdminPanel();
    }

    // إعداد لوحة تحكم المالك لإضافة أو إزالة الأدمنز بأمان
    function setupSuperAdminPanel() {
        const panel = byId('adminAccessPanel');
        const adminBtn = byId('adminAccessButton');
        if (!panel || !adminBtn) return;

        adminBtn.onclick = () => {
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                renderSuperAdminUI(panel);
            }
        };
    }

    function renderSuperAdminUI(panel) {
        // منع تكرار إنشاء الواجهة لو كانت موجودة
        if (byId('superAdminManagerContainer')) {
            loadAdminsList();
            return;
        }

        const container = document.createElement('div');
        container.id = 'superAdminManagerContainer';
        container.className = 'mt-4 pt-4 border-t border-slate-700 space-y-4';
        container.innerHTML = `
            <h3 class="text-sm font-bold text-amber-400">إدارة مشرفي الموقع (الأدمنز) - خاصة بالمالك فقط</h3>
            <div class="flex gap-2">
                <input type="email" id="newAdminEmailInput" placeholder="أدخل إيميل المشرف الجديد" class="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none" />
                <button id="addAdminBtn" type="button" class="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500 transition">تعيين كأدمن</button>
            </div>
            <p id="adminManageStatus" class="text-xs font-semibold"></p>
            <div class="space-y-2 mt-2">
                <h4 class="text-xs font-bold text-slate-300">قائمة الأدمنز الحاليين:</h4>
                <div id="adminsListContainer" class="space-y-1 max-h-40 overflow-y-auto"></div>
            </div>
        `;

        panel.appendChild(container);

        byId('addAdminBtn').onclick = async () => {
            const input = byId('newAdminEmailInput');
            const statusEl = byId('adminManageStatus');
            const emailToAdd = input.value.trim().toLowerCase();

            if (!emailToAdd) {
                statusEl.textContent = 'الرجاء إدخال البريد الإلكتروني.';
                statusEl.style.color = '#fca5a5';
                return;
            }

            statusEl.textContent = 'جاري الإضافة...';
            statusEl.style.color = '#cbd5e1';

            // إضافة الإيميل لجدول site_admins
            const { error } = await client
                .from('site_admins')
                .upsert([{ email: emailToAdd }], { onConflict: ['email'] });

            if (error) {
                statusEl.textContent = 'خطأ: ' + error.message;
                statusEl.style.color = '#fca5a5';
            } else {
                statusEl.textContent = 'تمت إضافة المشرف بنجاح!';
                statusEl.style.color = '#86efac';
                input.value = '';
                loadAdminsList();
            }
        };

        loadAdminsList();
    }

    async function loadAdminsList() {
        const listContainer = byId('adminsListContainer');
        if (!listContainer || !client) return;

        listContainer.innerHTML = '<p class="text-xs text-slate-400">جاري التحميل...</p>';
        const { data, error } = await client.from('site_admins').select('*');

        if (error || !data) {
            listContainer.innerHTML = '<p class="text-xs text-red-400">تعذر جلب قائمة الأدمنز.</p>';
            return;
        }

        listContainer.innerHTML = '';
        data.forEach(admin => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between bg-slate-950 p-2 rounded-lg text-xs';
            
            const emailSpan = document.createElement('span');
            emailSpan.className = 'text-white';
            emailSpan.textContent = admin.email || admin.user_id;

            row.appendChild(emailSpan);

            // منع حذف المالك الأساسي من القائمة لحماية الحساب
            if (config.ownerEmail && admin.email && admin.email.toLowerCase() === config.ownerEmail.toLowerCase()) {
                const badge = document.createElement('span');
                badge.className = 'text-amber-400 font-bold';
                badge.textContent = 'المالك الرئيسي';
                row.appendChild(badge);
            } else {
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded';
                removeBtn.textContent = 'إزالة الصلاحية';
                removeBtn.onclick = async () => {
                    if (confirm(`هل أنت متأكد من إزالة صلاحية الأدمن عن ${admin.email || 'هذا المستخدم'}؟`)) {
                        await client.from('site_admins').delete().eq('id', admin.id);
                        loadAdminsList();
                    }
                };
                row.appendChild(removeBtn);
            }

            listContainer.appendChild(row);
        });
    }

    function getStoragePath(filePath) {
        return decodeURIComponent(filePath).replace(/^publish-ready\//, '').replace(/^\/+/, '');
    }

    window.isSiteAdmin = () => true;

    window.loadLessonTextOverride = async function (filePath, pageNumber) {
        if (!client) return null;
        try {
            const { data } = await client.from('lesson_text_overrides').select('text_content, highlights').eq('storage_path', getStoragePath(filePath)).eq('page_number', pageNumber).maybeSingle();
            return data ? { text: data.text_content, highlights: data.highlights || [] } : null;
        } catch (e) {
            return null;
        }
    };

    window.saveLessonTextOverride = async function (filePath, pageNumber, textContent, highlights) {
        if (!client) throw new Error('قاعدة البيانات غير متصلة.');
        const { error } = await client.from('lesson_text_overrides').upsert({
            storage_path: getStoragePath(filePath), page_number: pageNumber, text_content: textContent, highlights: highlights || [], updated_at: new Date().toISOString()
        }, { onConflict: 'storage_path,page_number' });
        if (error) throw error;
    };

    window.loadProtectedPdf = async function (filePath) {
        if (!client) throw new Error('قاعدة البيانات غير متصلة.');
        const { data, error } = await client.storage.from(bucketName).download(getStoragePath(filePath));
        if (error) throw error;
        return new Uint8Array(await data.arrayBuffer());
    };

    window.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
