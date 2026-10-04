(function () {
    const config = window.SUPABASE_CONFIG || {};
    const bucketName = 'pdf-files';
    let client = null;
    let isSuperAdmin = false;

    const byId = id => document.getElementById(id);

    // فتح الموقع فوراً للجميع بدون أي شاشات تسجيل دخول
    function forcePublicAccess() {
        document.body.classList.add('site-access-granted');
        document.querySelectorAll('[data-protected-content]').forEach(element => { element.hidden = false; });
        const gate = byId('accessGate');
        if (gate) {
            gate.style.display = 'none';
            gate.classList.add('hidden');
        }
    }

    async function initialize() {
        forcePublicAccess();

        if (!config.url || !config.anonKey || config.url.includes('YOUR_')) {
            setupSuperAdminPanel();
            return;
        }

        if (window.supabase?.createClient) {
            client = window.supabase.createClient(config.url, config.anonKey, {
                auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
            });
            window.siteSupabase = client;

            // التحقق التلقائي من هويتك كأدمن رئيسي عبر الـ ownerEmail
            try {
                const { data: { session } } = await client.auth.getSession();
                const userEmail = session?.user?.email || '';
                
                if (config.ownerEmail && userEmail.toLowerCase() === config.ownerEmail.toLowerCase()) {
                    isSuperAdmin = true;
                    byId('adminAccessButton')?.classList.remove('hidden');
                } else if (userEmail) {
                    const { data } = await client.from('site_admins').select('email').eq('email', userEmail.toLowerCase()).maybeSingle();
                    if (data) {
                        isSuperAdmin = true;
                        byId('adminAccessButton')?.classList.remove('hidden');
                    }
                }
            } catch (e) {}
        }

        setupSuperAdminPanel();
    }

    // إعداد لوحة تحكم الأدمن لإضافة وإزالة المشرفين
    function setupSuperAdminPanel() {
        const panel = byId('adminAccessPanel');
        const adminBtn = byId('adminAccessButton');
        if (!panel || !adminBtn) return;

        adminBtn.classList.remove('hidden');

        adminBtn.onclick = () => {
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                renderSuperAdminUI(panel);
            }
        };
    }

    function renderSuperAdminUI(panel) {
        if (byId('superAdminManagerContainer')) {
            loadAdminsList();
            return;
        }

        const container = document.createElement('div');
        container.id = 'superAdminManagerContainer';
        container.className = 'space-y-4';
        container.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-700 pb-3">
                <h3 class="text-sm font-bold text-amber-400">إدارة مشرفي الموقع (الأدمنز)</h3>
            </div>
            <div class="flex gap-2">
                <input type="email" id="newAdminEmailInput" placeholder="أدخل إيميل المشرف الجديد (example@gmail.com)" class="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none" />
                <button id="addAdminBtn" type="button" class="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500 transition">تعيين كأدمن</button>
            </div>
            <p id="adminManageStatus" class="text-xs font-semibold"></p>
            <div class="space-y-2 mt-2">
                <h4 class="text-xs font-bold text-slate-300">قائمة الأدمنز الحاليين:</h4>
                <div id="adminsListContainer" class="space-y-2 max-h-48 overflow-y-auto"></div>
            </div>
        `;

        panel.appendChild(container);

        byId('addAdminBtn').onclick = async () => {
            if (!client) return;
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
            row.className = 'flex items-center justify-between bg-slate-950 p-2.5 rounded-xl text-xs border border-slate-800';
            
            const emailSpan = document.createElement('span');
            emailSpan.className = 'text-white font-medium';
            emailSpan.textContent = admin.email || admin.user_id;

            row.appendChild(emailSpan);

            if (config.ownerEmail && admin.email && admin.email.toLowerCase() === config.ownerEmail.toLowerCase()) {
                const badge = document.createElement('span');
                badge.className = 'text-amber-400 font-bold bg-amber-500/10 px-2 py-1 rounded';
                badge.textContent = 'المالك الرئيسي';
                row.appendChild(badge);
            } else {
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-2.5 py-1 rounded-lg transition';
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

    window.isSiteAdmin = () => isSuperAdmin;

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
        if (!isSuperAdmin) throw new Error('التعديل متاح للمسؤولين فقط.');
        const { error } = await client.from('lesson_text_overrides').upsert({
            storage_path: getStoragePath(filePath), page_number: pageNumber, text_content: textContent, highlights: highlights || [], updated_at: new Date().toISOString()
        }, { onConflict: 'storage_path,page_number' });
        if (error) throw error;
    };

    // دالة تحميل ملفات الـ PDF عبر الرابط المباشر العام من سوبابيس (Public URL)
    window.loadProtectedPdf = async function (filePath) {
        const cleanPath = getStoragePath(filePath);
        
        if (client) {
            try {
                // جلب الرابط العام المباشر من سوبابيس طالما الـ Bucket عام
                const { data } = client.storage.from(bucketName).getPublicUrl(cleanPath);
                if (data?.publicUrl) {
                    const response = await fetch(data.publicUrl);
                    if (response.ok) {
                        return new Uint8Array(await response.arrayBuffer());
                    }
                }
            } catch (e) {}
        }

        // محاولة تحميل الملف محلياً كخيار بديل
        try {
            const response = await fetch(filePath);
            if (response.ok) {
                return new Uint8Array(await response.arrayBuffer());
            }
        } catch (e) {}

        throw new Error(`تعذر تحميل الملف: ${filePath}`);
    };

    window.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
