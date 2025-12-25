package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.ide.projectView.ProjectViewNode
import com.intellij.ide.projectView.ProjectViewNodeDecorator
import com.intellij.packageDependencies.ui.PackageDependenciesNode
import com.intellij.ui.ColoredTreeCellRenderer
import com.intellij.ui.SimpleTextAttributes

class VestigeFileDecorator : ProjectViewNodeDecorator {
    override fun decorate(node: ProjectViewNode<*>, data: com.intellij.ide.projectView.PresentationData) {
        val file = node.virtualFile ?: return
        val project = node.project ?: return
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        
        val stats = analyzer.getFileStats(file) ?: return
        
        if (stats.commits > 20) {
            data.addText(" [🔥 Churn]", SimpleTextAttributes.ERROR_ATTRIBUTES)
        } else if (stats.ageDays > 365) {
            data.addText(" [🗿 Fossil]", SimpleTextAttributes.GRAYED_ATTRIBUTES)
        }
    }

    override fun decorate(node: PackageDependenciesNode, cellRenderer: ColoredTreeCellRenderer) {}
}
