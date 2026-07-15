import com.android.build.api.dsl.ApplicationExtension
import org.gradle.api.DefaultTask
import org.gradle.api.Plugin
import org.gradle.api.Project

class RustPlugin implements Plugin<Project> {
    static final String TASK_GROUP = "rust"
    private Config config

    @Override
    void apply(Project project) {
        config = project.extensions.create("rust", Config)

        def defaultAbiList = ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"]
        def abiList = project.findProperty("abiList")?.toString()?.split(',')?.toList() ?: defaultAbiList

        def defaultArchList = ["arm64", "arm", "x86", "x86_64"]
        def archList = project.findProperty("archList")?.toString()?.split(',') ?: defaultArchList

        def targetsList = project.findProperty("targetList")?.toString()?.split(',') ?: ["aarch64", "armv7", "i686", "x86_64"]

        project.extensions.configure(ApplicationExtension) { ext ->
            ext.flavorDimensions.add("abi")
            ext.productFlavors {
                create("universal") {
                    dimension = "abi"
                    ndk {
                        abiFilters.clear()
                        abiList.each { abiFilters.add(it) }
                    }
                }
                defaultArchList.eachWithIndex { arch, index ->
                    create(arch) {
                        dimension = "abi"
                        ndk {
                            abiFilters.add(defaultAbiList[index])
                        }
                    }
                }
            }
        }

        project.afterEvaluate {
            for (profile in ["debug", "release"]) {
                def profileCapitalized = profile.capitalize()
                def buildTask = project.tasks.maybeCreate(
                    "rustBuildUniversal${profileCapitalized}",
                    DefaultTask
                )
                buildTask.group = TASK_GROUP
                buildTask.description = "Build dynamic library in ${profile} mode for all targets"

                project.tasks["mergeUniversal${profileCapitalized}JniLibFolders"].dependsOn(buildTask)

                targetsList.eachWithIndex { targetName, idx ->
                    def targetArch = archList[idx]
                    def targetArchCapitalized = targetArch.capitalize()
                    def targetBuildTask = project.tasks.maybeCreate(
                        "rustBuild${targetArchCapitalized}${profileCapitalized}",
                        BuildTask
                    )
                    targetBuildTask.group = TASK_GROUP
                    targetBuildTask.description = "Build dynamic library in ${profile} mode for ${targetArch}"
                    targetBuildTask.rootDirRel = config.rootDirRel
                    targetBuildTask.target = targetName
                    targetBuildTask.release = profile == "release"

                    buildTask.dependsOn(targetBuildTask)
                    project.tasks["merge${targetArchCapitalized}${profileCapitalized}JniLibFolders"].dependsOn(targetBuildTask)
                }
            }
        }
    }
}

class Config {
    String rootDirRel
}