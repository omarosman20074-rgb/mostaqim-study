// site-auth.js - نسخة معدلة لدخول الجميع فوراً والتحكم بالأدمن عبر جدول site_admins

document.addEventListener("DOMContentLoaded", async () => {
    // التحقق من حالة المستخدم عند فتح الموقع
    checkUserAccess();
});

// دالة للتحقق من السماح للمستخدم بالدخول وعرض الواجهة المناسبة
async function checkUserAccess() {
    try {
        // التحقق من وجود جلسة نشطة في Supabase
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();
        
        const loginContainer = document.getElementById("login-container"); // حاوية تسجيل الدخول إن وجدت
        const mainContent = document.getElementById("main-content");       // محتوى الموقع الرئيسي
        const adminPanelBtn = document.getElementById("admin-panel-btn");   // زر لوحة التحكم (إن وجد)

        if (!session) {
            // لو المستخدم مش مسجل دخول، اعرض له شاشة تسجيل الدخول لو متوفرة
            if (loginContainer) loginContainer.style.display = "block";
            if (mainContent) mainContent.style.display = "none";
            return;
        }

        // المستخدم مسجل دخول بالفعل، اسمح له بدخول الموقع مباشرة
        if (loginContainer) loginContainer.style.display = "none";
        if (mainContent) mainContent.style.display = "block";

        // تسجيل المستخدم تلقائياً في جدول الطلبات/المسجلين (site_access_requests) للمتابعة
        await registerUserVisit(session.user.email);

        // التحقق هل المستخدم الحالي هو أدمن (موجود في جدول site_admins)
        const isAdmin = await checkIfAdmin(session.user.email);

        if (isAdmin) {
            if (adminPanelBtn) adminPanelBtn.style.display = "block";
            // إظهار أي صلاحيات خاصة بالأدمن هنا
            console.log("المستخدم أدمن وله صلاحيات الإدارة.");
        } else {
            if (adminPanelBtn) adminPanelBtn.style.display = "none";
        }

    } catch (err) {
        console.error("حدث خطأ أثناء التحقق من الصلاحيات:", err);
    }
}

// دالة لتسجيل أو تحديث ظهور المستخدم في جدول site_access_requests
async function registerUserVisit(email) {
    try {
        await window.supabaseClient
            .from('site_access_requests')
            .upsert({ email: email, status: 'approved', updated_at: new Date() }, { onConflict: 'email' });
    } catch (e) {
        console.log("تنبيه أثناء تسجیل الزيارة:", e);
    }
}

// دالة للتحقق من جدول site_admins
async function checkIfAdmin(email) {
    try {
        const { data, error } = await window.supabaseClient
            .from('site_admins')
            .select('email')
            .eq('email', email)
            .single();

        return data ? true : false;
    } catch (e) {
        return false;
    }
}

// دالة تسجيل الدخول (تُستدعى عند الضغط على زر الدخول أو إدخال الإيميل)
window.handleUserLogin = async function(email) {
    try {
        // إرسال رابط تسجيل الدخول أو الدخول المباشر حسب إعدادات Supabase لديك
        const { error } = await window.supabaseClient.auth.signInWithOtp({ 
            email: email,
            options: { emailRedirectTo: window.location.origin }
        });

        if (error) {
            alert("خطأ في تسجيل الدخول: " + error.message);
        } else {
            alert("تم إرسال رابط الدخول أو تم تسجيل الدخول بنجاح. تحقق من بريدك أو تابع.");
        }
    } catch (err) {
        console.error(err);
    }
}

// دالة تسجيل الخروج
window.handleLogout = async function() {
    await window.supabaseClient.auth.signOut();
    window.location.reload();
}
```[cite: 2]

### كيف تتحكم في من هو الأدمن الآن؟
1. افتح مشروعك في **Supabase** ثم اذهب إلى **Table Editor** وافتح جدول **`site_admins`**[cite: 2].
2. أي إيميل تضيفه يدوياً في هذا الجدول (`site_admins`) سيصبح **أدمن فوراً** وتظهر له صلاحيات التحكم[cite: 2].
3. أي إيميل آخر يقوم بفتح الموقع وتسجيل دخوله سيتمكن من تصفح الموقع والمحاضرات والسكاشن فوراً بدون أي شاشة انتظار أو رفض[cite: 2]!
