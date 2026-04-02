import { Product } from "@workspace/api-client-react";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("fb_agent_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const createProductWithImages = async (
  data: Record<string, any>,
  files: File[]
): Promise<Product> => {
  const formData = new FormData();
  
  Object.entries(data).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      formData.append(key, val.toString());
    }
  });

  files.forEach(file => {
    formData.append('images[]', file);
  });

  const res = await fetch('/api/products', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to create product');
  }

  return res.json();
};

export const updateProductWithImages = async (
  id: number,
  data: Record<string, any>,
  files: File[]
): Promise<Product> => {
  const formData = new FormData();
  
  Object.entries(data).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      if (typeof val === 'object' && key === 'keepImages') {
        formData.append(key, JSON.stringify(val));
      } else {
        formData.append(key, val.toString());
      }
    }
  });

  files.forEach(file => {
    formData.append('images[]', file);
  });

  const res = await fetch(`/api/products/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to update product');
  }

  return res.json();
};
