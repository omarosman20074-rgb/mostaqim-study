// site-auth.js - النسخة الأصلية القديمة

document.addEventListener("DOMContentLoaded", async () => {
    initAuth();
});

async function initAuth() {
    const loginContainer = document.getElementById("login-container");
    const mainContent = document.getElementById("main-content");
    const emailInput = document.getElementById("email-input");
    const submitBtn = document.getElementById("submit-btn");
    const statusMsg = document.getElementById("status-msg");

    if (!window.supabaseClient) return;

    // التحقق من الجلسة الحالية
    const { data: { session } } = await window.supabaseClient.auth.getSession();

    if (!session) {
        if (loginContainer) loginContainer.style.display = "block";
        if (mainContent) mainContent.style.display = "none";
        
        if (submitBtn) {
            submitBtn.onclick = async () => {
                const email = emailInput ? emailInput.value.trim() : "";
                if (!email) {
                    alert("الرجاء إدخال البريد الإلكتروني");
                    return;
                }

                if (statusMsg) statusMsg.textContent = "جاري إرسال رابط التحقق لبريدك...";

                const { error } = await window.supabaseClient.auth.signInWithOtp({
                    email: email,
                    options: { emailRedirectTo: window.location.origin }
                });

                if (error) {
                    if (statusMsg) statusMsg.textContent = "خطأ: " + error.message;
                } else {
                    if (statusMsg) statusMsg.textContent = "تم إرسال رابط التحقق! تفقد بريدك الإلكتروني.";
                }
            };
        }
        return;
    }

    // التحقق من الطلبات أو الصلاحيات للمستخدم المسجل
    const email = session.user.email;
    
    // التحقق من جدول الطلبات أو الأدمن
    const isApproved = await checkUserApproval(email);

    if (isApproved) {
        if (loginContainer) loginContainer.style.display = "none";
        if (mainContent) mainContent.style.display = "block";
    } else {
        if (loginContainer) {
            loginContainer.style.display = "block";
            if (statusMsg) statusMsg.textContent = "حسابك قيد المراجعة أو غير مصرح له بالدخول.";
        }
        if (mainContent) mainContent.style.display = "none";
    }
}

async function checkUserApproval(email) {
    try {
        // التحقق من جدول الأدمن أولاً
        const { data: adminData } = await window.supabaseClient
            .from('site_admins')
            .select('email')
            .eq('email', email)
            .single();

        if (adminData) return true;

        // التحقق من جدول الطلبات
        const { data: requestData } = await window.supabaseClient
            .from('site_access_requests')
            .select('status')
            .eq('email', email)
            .single();

        return requestData && requestData.status === 'approved';
    } catch (e) {
        return false;
    }
}
