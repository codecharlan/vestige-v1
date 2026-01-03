package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.ListSelectionModel

class VestigeCommitPicker(
    private val project: Project,
    private val file: VirtualFile,
    private val commits: List<VestigeGitAnalyzer.CommitInfo>
) : DialogWrapper(project) {

    private val list = JBList(commits.map { "[${it.hash.take(7)}] ${it.author}: ${it.message}" })

    init {
        title = "Select Point in Time"
        list.selectionMode = ListSelectionModel.SINGLE_SELECTION
        init()
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel(BorderLayout())
        panel.preferredSize = Dimension(500, 300)
        panel.add(JBScrollPane(list), BorderLayout.CENTER)
        return panel
    }

    fun getSelectedHash(): String? {
        val index = list.selectedIndex
        return if (index >= 0) commits[index].hash else null
    }
}
