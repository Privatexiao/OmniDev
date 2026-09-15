<script setup>
/**
 * @file ProjectTabs.vue
 * @description 项目选项卡组件，用于展示顶部登记的项目页签、支持点击切换项目、登记新项目以及编辑和删除配置
 */
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  projects: {
    type: Array,
    default: () => []
  },
  activeProjectId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'select-project',
  'add-project',
  'edit-project',
  'delete-project'
])

const hoveredProjectId = ref(null)
let projectHoverTimer = null

const handleProjectMouseEnter = (projectId) => {
  if (projectHoverTimer) clearTimeout(projectHoverTimer)
  projectHoverTimer = setTimeout(() => {
    hoveredProjectId.value = projectId
  }, 500)
}

const handleProjectMouseLeave = () => {
  if (projectHoverTimer) clearTimeout(projectHoverTimer)
  hoveredProjectId.value = null
}

const selectProject = (id) => {
  emit('select-project', id)
}

const openEditProject = (proj) => {
  emit('edit-project', proj)
}

const deleteProject = (id, name) => {
  emit('delete-project', id, name)
}

const openAddProject = () => {
  emit('add-project')
}

onUnmounted(() => {
  if (projectHoverTimer) {
    clearTimeout(projectHoverTimer)
    projectHoverTimer = null
  }
})
</script>

<template>
  <div class="projects-bar-row">
    <!-- 🍎 紧凑型 Segmented Control 分段控制器 -->
    <div class="segmented-control" v-if="projects.length > 0">
      <button 
        v-for="proj in projects" 
        :key="proj.id" 
        class="tab-btn" 
        :class="{ active: activeProjectId === proj.id }"
        @click="selectProject(proj.id)"
        @mouseenter="handleProjectMouseEnter(proj.id)"
        @mouseleave="handleProjectMouseLeave"
      >
        <svg class="tab-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 3.5h4l1.5 2h7.5v7h-13z"/></svg>
        <span class="tab-name">{{ proj.name }}</span>
        <div class="tab-actions" v-if="hoveredProjectId === proj.id" @click.stop>
          <span class="action-btn edit" @click.stop="openEditProject(proj)" title="修改项目配置">
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M11 2l3 3L5 14H2v-3L11 2z"/></svg>
          </span>
          <span class="action-btn delete" @click.stop="deleteProject(proj.id, proj.name)" title="删除项目登记">
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 4h10M6 4V2.5h4V4M5 4v9h6V4"/></svg>
          </span>
        </div>
      </button>
    </div>
    
    <!-- 独立新增项目胶囊按键 -->
    <button class="tab-btn-add press-spring" @click="openAddProject" title="登记新开发项目分支">
      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
      <span>新增项目</span>
    </button>
  </div>
</template>

<style scoped>
.projects-bar-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12px 0 14px 0;
}

.segmented-control {
  display: inline-flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.045);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: var(--radius-pill, 980px);
  padding: 3px;
  gap: 2px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
}

[data-theme="dark"] .segmented-control {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  border-radius: var(--radius-pill, 980px);
  padding: 5px 14px;
  height: 28px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  box-sizing: border-box;
  color: var(--text-secondary, #6e6e73);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: var(--tracking-body, -0.006em);
}

.tab-btn:hover:not(.active) {
  color: var(--text, #1d1d1f);
}

.tab-btn.active {
  background: #ffffff;
  color: var(--text, #1d1d1f);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.06);
}

[data-theme="dark"] .tab-btn.active {
  background: #282930;
  border-color: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.tab-icon {
  opacity: 0.75;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.tab-btn.active .tab-icon {
  opacity: 1;
  color: var(--color-brand, #0066cc);
}

.tab-name {
  font-size: 12.5px;
  font-weight: 500;
  color: inherit;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.tab-btn.active .tab-name {
  font-weight: 600;
}

.tab-btn-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
  color: var(--text-secondary, #6e6e73);
  border-radius: var(--radius-pill, 980px);
  padding: 0 14px;
  height: 30px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: var(--tracking-body, -0.006em);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.6, 1);
  outline: none;
}

[data-theme="dark"] .tab-btn-add {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
  color: #a1a1a6;
}

.tab-btn-add:hover {
  background: var(--surface, #ffffff);
  color: var(--color-brand, #0066cc);
  border-color: rgba(0, 102, 204, 0.25);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

[data-theme="dark"] .tab-btn-add:hover {
  background: #2c2c2e;
  color: #2997ff;
  border-color: #2997ff;
}

.tab-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 2px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-pill, 9999px);
  background: rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  color: var(--text-secondary, #6b7280);
}

[data-theme="dark"] .action-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #9ca3af;
}

.action-btn:hover {
  transform: scale(1.1);
}

.action-btn.edit:hover {
  background: #eab308;
  color: #ffffff;
}

.action-btn.delete:hover {
  background: #ef4444;
  color: #ffffff;
}
</style>
