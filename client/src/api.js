const API_BASE = '/api'

async function request(url, options = {}) {
  const token = localStorage.getItem('token')
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Don't set Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type']
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }))
    throw new Error(err.error || '请求失败')
  }

  return res.json()
}

export const api = {
  // Auth
  login(username, password) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
  },
  getMe() {
    return request('/auth/me')
  },
  changePassword(oldPassword, newPassword) {
    return request('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword })
    })
  },

  // Posts (public)
  getPublishedPosts(page = 1, tag = '') {
    let url = `/posts/published?page=${page}`
    if (tag) url += `&tag=${encodeURIComponent(tag)}`
    return request(url)
  },
  getPostBySlug(slug) {
    return request(`/posts/slug/${slug}`)
  },

  // Posts (admin)
  getPosts(page = 1, all = true) {
    return request(`/posts?page=${page}&all=${all}`)
  },
  getPost(id) {
    return request(`/posts/${id}`)
  },
  createPost(data) {
    return request('/posts', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },
  updatePost(id, data) {
    return request(`/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },
  deletePost(id) {
    return request(`/posts/${id}`, { method: 'DELETE' })
  },

  // Tags
  getTags() {
    return request('/tags')
  },

  // Settings
  getSettings() {
    return request('/settings')
  },
  updateSetting(key, value) {
    return request('/settings', {
      method: 'PUT',
      body: JSON.stringify({ key, value })
    })
  },

  // Upload
  upload(file) {
    const formData = new FormData()
    formData.append('file', file)
    return request('/upload', {
      method: 'POST',
      body: formData
    })
  }
}
