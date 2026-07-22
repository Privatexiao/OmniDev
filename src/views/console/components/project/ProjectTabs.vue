<script setup>
/**
 * @file ProjectTabs.vue
 * @description 项目选项卡组件，用于展示顶部登记的项目页签、支持点击切换项目、登记新项目以及编辑和删除配置
 */
import { ref } from 'vue'

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
</script>

<template>
  <div class="projects-tabs-bar">
    <div class="tabs-container">
      <button 
        v-for="proj in projects" 
        :key="proj.id" 
        class="tab-btn" 
        :class="{ active: activeProjectId === proj.id }"
        @click="selectProject(proj.id)"
        @mouseenter="handleProjectMouseEnter(proj.id)"
        @mouseleave="handleProjectMouseLeave"
      >
        <span class="tab-icon">📁</span>
        <span class="tab-name">{{ proj.name }}</span>
        <div class="tab-actions" v-if="hoveredProjectId === proj.id" @click.stop>
          <span class="action-btn edit" @click.stop="openEditProject(proj)" title="修改项目配置">✏️</span>
          <span class="action-btn delete" @click.stop="deleteProject(proj.id, proj.name)" title="删除项目登记">🗑️</span>
        </div>
      </button>
      
      <button class="tab-btn-add" @click="openAddProject" title="登记新开发项目分支">
        ➕ 新增项目
      </button>
    </div>
  </div>
</template>

<style scoped>
.projects-tabs-bar {
  margin: 0.8rem 0;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 4px 20px rgba(31, 38, 135, 0.03);
  transition: all 0.3s ease;
}

[data-theme="dark"] .projects-tabs-bar {
  background: rgba(15, 23, 42, 0.4);
  border-color: rgba(255, 255, 255, 0.08);
}

.tabs-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  box-sizing: border-box;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

[data-theme="dark"] .tab-btn {
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(99, 102, 241, 0.35);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.04);
}

[data-theme="dark"] .tab-btn:hover {
  background: rgba(30, 41, 59, 0.85);
  border-color: rgba(99, 102, 241, 0.45);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.tab-btn.active {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-color);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
  transform: translateY(-0.5px);
}

[data-theme="dark"] .tab-btn.active {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-color);
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.12);
}

.tab-icon {
  font-size: 0.95rem;
  opacity: 0.85;
  transition: transform 0.2s ease;
}

.tab-btn:hover .tab-icon {
  transform: scale(1.1);
}

.tab-name {
  font-size: 0.82rem;
  font-weight: 750;
  color: var(--text);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  transition: color 0.2s ease;
}

.tab-btn.active .tab-name {
  color: var(--btn-primary-color);
}

.tab-btn-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(99, 102, 241, 0.06);
  border: 1px dashed rgba(99, 102, 241, 0.25);
  color: var(--primary);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s ease;
  outline: none;
  margin-left: auto;
}

.tab-btn-add:hover {
  background: rgba(99, 102, 241, 0.12);
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
  transform: translateY(-1px);
}

.tab-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  animation: fadeInActions 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes fadeInActions {
  from {
    opacity: 0;
    transform: translateX(5px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

[data-theme="dark"] .action-btn {
  background: rgba(255, 255, 255, 0.06);
}

.tab-btn.active .action-btn {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-color);
}

.action-btn:hover {
  transform: scale(1.15);
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
