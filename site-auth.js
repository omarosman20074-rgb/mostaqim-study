(function () {
    const config = window.SUPABASE_CONFIG || {};
    const bucketName = 'pdf-files';
    let client = null;

    const byId = id => document.getElementById(id);

    // إلغاء شاشة الحماية وفتح المحتوى للجميع فوراً
    function grantPublicAccess() {
        document.body.classList.add('site-access-granted');
        document.querySelectorAll('[data-protected-content]').forEach(element => { element.hidden = false; });
        byId('accessGate')?.classList.add('hidden');
        byId('adminAccessButton')?.classList.add('hidden');
        byId('adminAccessPanel')?.classList.add('hidden');
    }

    async function initialize() {
        grantPublicAccess();

        if (!config.url || !config.anonKey || config.url.includes('YOUR_')) {
            return;
        }

        if (window.supabase?.createClient) {
            client = window.supabase.createClient(config.url, config.anonKey, {
                auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
            });
            window.siteSupabase = client;
        }
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
