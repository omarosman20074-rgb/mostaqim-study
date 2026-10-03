// site-auth.js - النسخة النهائية المباشرة والآمنة

document.addEventListener("DOMContentLoaded", async () => {
    // فتح الموقع للجميع فوراً وإزالة أي قيود
    initOpenSite();
});

function initOpenSite() {
    // إخفاء شاشة تسجيل الدخول الإجبارية لو وجدت لضمان فتح الموقع فوراً
    const loginContainer = document.getElementById("login-container");
    const mainContent = document.getElementById("main-content");
    
    if (loginContainer) loginContainer.style.display = "none";
    if (mainContent) mainContent.style.display = "block";

    // التحقق من الأدمن في الخلفية بهدوء
    checkAdminSilently();
}

async function checkAdminSilently() {
    try {
        if (!window.supabaseClient) return;

        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session || !session.user) return;

        const email = session.user.email;

        // التحقق من جدول site_admins
        const { data, error } = await window.supabaseClient
            .from('site_admins')
            .select('email')
            .eq('email', email)
            .single();

        const adminPanelBtn = document.getElementById("admin-panel-btn");
        if (data && adminPanelBtn) {
            adminPanelBtn.style.display = "block"; // إظهار زر التحكم لو أنت الأدمن
        }
    } catch (e) {
        console.log("وضع التصفح العادي");
    }
}
