package io.github.CyberTimon.RapidRAW

import android.app.Activity
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

object PermissionHelper {
    private var currentActivityRef: WeakReference<Activity>? = null

    @JvmStatic
    fun setCurrentActivity(activity: Activity?) {
        currentActivityRef = activity?.let { WeakReference(it) }
    }

    @JvmStatic
    fun requestPermissions(context: android.content.Context, permissions: Array<String>) {
        val activity = currentActivityRef?.get()
        if (activity != null && !activity.isFinishing && !activity.isDestroyed) {
            ActivityCompat.requestPermissions(activity, permissions, 1001)
        }
    }
}
