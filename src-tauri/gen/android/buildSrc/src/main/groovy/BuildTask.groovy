import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

class BuildTask extends DefaultTask {
    @Input
    String rootDirRel
    @Input
    String target
    @Input
    Boolean release

    @TaskAction
    void assemble() {
        // Rust .so 已通过 cargo-ndk 预编译到 jniLibs，跳过 tauri CLI 构建
        // 检查预编译 .so 是否存在
        def jniDir = new File(project.projectDir, "src/main/jniLibs")
        if (jniDir.exists()) {
            def soFiles = jniDir.listFiles()?.collectMany { it.listFiles()?.findAll { f -> f.name.endsWith(".so") } } ?: []
            if (soFiles) {
                project.logger.lifecycle("Using pre-built Rust libraries: ${soFiles.collect { it.name }}")
                return
            }
        }
        // 如果没有预编译 .so，回退到 tauri CLI
        project.logger.lifecycle("No pre-built .so found, falling back to tauri CLI build...")
        String executable = "npm"
        try {
            runTauriCli(executable)
        } catch (Exception e) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                def fallbacks = [
                    "${executable}.exe",
                    "${executable}.cmd",
                    "${executable}.bat"
                ]
                Exception lastException = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (Exception fallbackException) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e
            }
        }
    }

    void runTauriCli(String executable) {
        if (!rootDirRel) throw new GradleException("rootDirRel cannot be null")
        if (!target) throw new GradleException("target cannot be null")
        if (release == null) throw new GradleException("release cannot be null")

        def args = ["run", "--", "tauri", "android", "android-studio-script"]

        project.exec {
            workingDir = new File(project.projectDir, rootDirRel)
            it.executable = executable
            it.args = args
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                it.args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                it.args("-v")
            }
            if (release) {
                it.args("--release")
            }
            it.args(["--target", target])
        }.assertNormalExitValue()
    }
}